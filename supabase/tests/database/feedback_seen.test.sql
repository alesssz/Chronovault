-- =============================================================================
-- Feedback seen (pgTAP): the owner's last visit to each group of versions is
-- theirs alone: visitors cannot touch the table, another user can neither
-- read nor write it, and the owner can record and move it.
-- Run with:  make db-test   (or: pnpm test:db)
-- Everything runs in a transaction that is rolled back: the DB stays clean.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;

select plan(7);

-- -----------------------------------------------------------------------------
-- Fixtures (inserted as superuser, so RLS does not apply)
--   user A: a group of versions g1;  user B: nothing
-- -----------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local');

insert into public.playlists (id, user_id, title, visibility, purpose) values
  ('c1111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Song – versions', 'unlisted', 'versions');

select table_privs_are('public', 'feedback_seen', 'anon', array[]::text[],
  'anonymous visitors cannot touch feedback_seen');

-- -----------------------------------------------------------------------------
-- User A, the owner
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "role": "authenticated"}', true);

select lives_ok(
  $$ insert into public.feedback_seen (playlist_id) values ('c1111111-1111-4111-8111-111111111111') $$,
  'the owner records a visit to their group'
);
select lives_ok(
  $$ update public.feedback_seen set seen_at = now() + interval '1 minute'
     where playlist_id = 'c1111111-1111-4111-8111-111111111111' $$,
  'the owner moves it on a later visit'
);
select results_eq(
  $$ select count(*)::int from public.feedback_seen $$,
  $$ values (1) $$,
  'the owner reads it'
);

-- -----------------------------------------------------------------------------
-- User B
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "role": "authenticated"}', true);

select is_empty($$ select 1 from public.feedback_seen $$, 'B cannot read A''s visits');
select is_empty(
  $$ update public.feedback_seen set seen_at = now() returning 1 $$,
  'B cannot move A''s visits'
);
select throws_ok(
  $$ insert into public.feedback_seen (playlist_id) values ('c1111111-1111-4111-8111-111111111111')
     on conflict (playlist_id) do nothing $$,
  '42501', null,
  'B cannot record a visit to A''s group'
);

select * from finish();
rollback;
