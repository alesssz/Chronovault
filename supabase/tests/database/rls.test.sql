-- =============================================================================
-- Security tests (pgTAP): RLS policies, constraints and sharing functions.
-- Run with:  make db-test   (or: pnpm test:db)
-- Everything runs in a transaction that is rolled back: the DB stays clean.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;

select plan(33);

-- -----------------------------------------------------------------------------
-- Fixtures (inserted as superuser, so RLS does not apply)
--   user A: one private, one unlisted and one public track
--   user B: no tracks
-- -----------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local');

insert into public.tracks (id, user_id, title, audio_path, mime_type, size_bytes, visibility) values
  ('a1111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Private A',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/a1111111-1111-4111-8111-111111111111.mp3', 'audio/mpeg', 1, 'private'),
  ('a2222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Unlisted A',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/a2222222-2222-4222-8222-222222222222.mp3', 'audio/mpeg', 1, 'unlisted'),
  ('a3333333-3333-4333-8333-333333333333', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Public A',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/a3333333-3333-4333-8333-333333333333.mp3', 'audio/mpeg', 1, 'public');

insert into storage.objects (bucket_id, name) values
  ('audio', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/a1111111-1111-4111-8111-111111111111.mp3'),
  ('audio', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/a2222222-2222-4222-8222-222222222222.mp3'),
  ('audio', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/a3333333-3333-4333-8333-333333333333.mp3');

-- -----------------------------------------------------------------------------
-- Draft / final status
-- -----------------------------------------------------------------------------
select is(
  (select status::text from public.tracks where id = 'a1111111-1111-4111-8111-111111111111'),
  'draft',
  'a new track starts as a draft (work in progress)'
);

select is(
  (select status::text from public.get_shared_track('a2222222-2222-4222-8222-222222222222')),
  'draft',
  'get_shared_track returns the status, so share pages can say "Work in progress"'
);

-- -----------------------------------------------------------------------------
-- Table privileges (explicit, independent of the project's default grants)
-- -----------------------------------------------------------------------------
select table_privs_are('public', 'tracks', 'anon', array[]::text[],
  'anonymous visitors cannot touch the tracks table (sharing goes through get_shared_track)');
select table_privs_are('public', 'genres', 'anon', array['SELECT'],
  'anonymous visitors can only read genres');
select table_privs_are('public', 'tracks', 'authenticated', array['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  'signed-in users can read and write tracks (RLS limits the rows)');
select table_privs_are('public', 'genres', 'authenticated', array['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  'signed-in users can read and write genres (RLS limits the rows)');

-- -----------------------------------------------------------------------------
-- Schema constraints
-- -----------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.tracks (user_id, title, audio_path, mime_type, size_bytes)
     values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'x', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/x.mp3', 'audio/mpeg', 1) $$,
  '23514', null,
  'the audio file must live in the owner''s folder'
);

select throws_ok(
  $$ update public.tracks set user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
     where id = 'a1111111-1111-4111-8111-111111111111' $$,
  'P0001', 'user_id cannot be changed',
  'the owner of a track cannot be changed'
);

update public.tracks set lyrics = '   ', lyrics_synced = '[]' where id = 'a1111111-1111-4111-8111-111111111111';
select is(
  (select row(has_lyrics, has_synced_lyrics)::text from public.tracks where id = 'a1111111-1111-4111-8111-111111111111'),
  '(f,f)',
  'has_lyrics / has_synced_lyrics ignore blank text and empty arrays'
);

update public.tracks set lyrics = 'la la', lyrics_synced = '[{"time": 1, "text": "la la"}]' where id = 'a1111111-1111-4111-8111-111111111111';
select is(
  (select row(has_lyrics, has_synced_lyrics)::text from public.tracks where id = 'a1111111-1111-4111-8111-111111111111'),
  '(t,t)',
  'has_lyrics / has_synced_lyrics update automatically'
);

-- -----------------------------------------------------------------------------
-- User B
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "role": "authenticated"}', true);

select is_empty(
  $$ select 1 from public.tracks $$,
  'B cannot read A''s tracks from the table, not even public ones'
);

select is_empty(
  $$ select 1 from public.get_shared_track('a1111111-1111-4111-8111-111111111111') $$,
  'get_shared_track never returns private tracks'
);

select results_eq(
  $$ select title from public.get_shared_track('a2222222-2222-4222-8222-222222222222') $$,
  $$ values ('Unlisted A') $$,
  'get_shared_track returns unlisted tracks (link access)'
);

select results_eq(
  $$ select title from public.get_shared_track('a3333333-3333-4333-8333-333333333333') $$,
  $$ values ('Public A') $$,
  'get_shared_track returns public tracks'
);

select is_empty(
  $$ select 1
     from pg_proc p, unnest(p.proargnames) as arg(name)
     where p.oid = 'public.get_shared_track(uuid)'::regprocedure
       and arg.name in ('suno_prompt', 'mastered', 'user_id') $$,
  'get_shared_track never exposes the Suno prompt, the mastering status or the owner'
);

select is_empty(
  $$ update public.tracks set title = 'hack' where id = 'a3333333-3333-4333-8333-333333333333' returning id $$,
  'B cannot update A''s tracks'
);

select is_empty(
  $$ delete from public.tracks where id = 'a3333333-3333-4333-8333-333333333333' returning id $$,
  'B cannot delete A''s tracks'
);

select throws_ok(
  $$ insert into public.tracks (user_id, title, audio_path, mime_type, size_bytes)
     values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'x', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/x.mp3', 'audio/mpeg', 1) $$,
  '42501', null,
  'B cannot create tracks on behalf of A'
);

select lives_ok(
  $$ insert into public.tracks (id, title, audio_path, mime_type, size_bytes)
     values ('b1111111-1111-4111-8111-111111111111', 'B''s track', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/b1111111-1111-4111-8111-111111111111.mp3', 'audio/mpeg', 1) $$,
  'B creates own tracks (user_id defaults to auth.uid())'
);

select ok(
  (select count(*) from public.genres where user_id is null) > 0,
  'built-in genres are visible'
);

select lives_ok(
  $$ insert into public.genres (user_id, name) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Vaporwave') $$,
  'B creates a custom genre'
);

select throws_ok(
  $$ insert into public.genres (user_id, name) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', ' vaporwave ') $$,
  '23505', null,
  'genre names are unique per user (ignoring case and spaces)'
);

select throws_ok(
  $$ insert into public.genres (user_id, name) values (null, 'Global genre') $$,
  '42501', null,
  'users cannot create built-in genres'
);

-- Storage
select lives_ok(
  $$ insert into storage.objects (bucket_id, name) values ('audio', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/b1.mp3') $$,
  'B uploads files into own folder'
);

select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('audio', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/intruder.mp3') $$,
  '42501', null,
  'B cannot upload files into A''s folder'
);

select results_eq(
  $$ select name from storage.objects where bucket_id = 'audio' and name like 'aaaaaaaa%' order by name $$,
  $$ values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/a2222222-2222-4222-8222-222222222222.mp3'),
            ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/a3333333-3333-4333-8333-333333333333.mp3') $$,
  'B only reads audio files of A''s non-private tracks'
);

-- -----------------------------------------------------------------------------
-- User A
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "role": "authenticated"}', true);

select results_eq(
  $$ select count(*)::int from public.tracks $$,
  $$ values (3) $$,
  'A sees all own tracks but not B''s private one'
);

select is_empty(
  $$ select 1 from public.genres where name = 'Vaporwave' $$,
  'A cannot see B''s custom genres'
);

select results_eq(
  $$ select count(*)::int from storage.objects where bucket_id = 'audio' and name like 'aaaaaaaa%' $$,
  $$ values (3) $$,
  'A reads all own files'
);

-- -----------------------------------------------------------------------------
-- Anonymous visitor
-- -----------------------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);

select throws_ok(
  $$ select title from public.tracks $$,
  '42501', null,
  'an anonymous visitor cannot read the tracks table'
);

select results_eq(
  $$ select title, genre from public.get_shared_track('a2222222-2222-4222-8222-222222222222') $$,
  $$ values ('Unlisted A', null::text) $$,
  'an anonymous visitor opens an unlisted track by its link'
);

select is_empty(
  $$ select 1 from public.get_shared_track('a1111111-1111-4111-8111-111111111111') $$,
  'an anonymous visitor cannot open a private track, even with its id'
);

select results_eq(
  $$ select count(*)::int from storage.objects where bucket_id = 'audio' and name like 'aaaaaaaa%' $$,
  $$ values (2) $$,
  'an anonymous visitor only reads files of non-private tracks'
);

select * from finish();
rollback;
