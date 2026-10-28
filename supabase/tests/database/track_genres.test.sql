-- =============================================================================
-- A track's genre (pgTAP, …_track_genre_and_lock_order.sql): a built-in genre
-- or one of the track owner's own, never another user's custom genre, which
-- answers like a missing one (23503: no id's existence is told).
-- Run with:  make db-test   (or: pnpm test:db)
-- Everything runs in a transaction that is rolled back: the DB stays clean.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;

select plan(7);

-- -----------------------------------------------------------------------------
-- Fixtures (inserted as superuser, so RLS does not apply)
--   user A: a custom genre "Dark folk", and a track in it
--   user B: a custom genre "Vaporwave", and a track without a genre
-- -----------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local');

insert into public.genres (id, user_id, name) values
  ('ea111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Dark folk'),
  ('eb111111-1111-4111-8111-111111111111', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Vaporwave');

insert into public.tracks (id, user_id, title, audio_path, mime_type, size_bytes, genre_id) values
  ('a1111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Track A',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/a1111111-1111-4111-8111-111111111111.mp3', 'audio/mpeg', 1,
   'ea111111-1111-4111-8111-111111111111'),
  ('b1111111-1111-4111-8111-111111111111', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Track B',
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/b1111111-1111-4111-8111-111111111111.mp3', 'audio/mpeg', 1, null);

select ok(
  not has_function_privilege('authenticated', 'private.check_track_genre()', 'execute')
    and not has_function_privilege('anon', 'private.check_track_genre()', 'execute'),
  'the genre check is fired by its trigger only, never called'
);

-- -----------------------------------------------------------------------------
-- User B
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "role": "authenticated"}', true);

-- Before: accepted (the foreign key does not look at RLS), and A's private genre showed on B's share page.
select throws_ok(
  $$ update public.tracks set genre_id = 'ea111111-1111-4111-8111-111111111111'
     where id = 'b1111111-1111-4111-8111-111111111111' $$,
  '23503', 'genre not found',
  'B cannot put own track in A''s custom genre'
);
select throws_ok(
  $$ insert into public.tracks (id, title, audio_path, mime_type, size_bytes, genre_id) values
       ('b2222222-2222-4222-8222-222222222222', 'New B',
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/b2222222-2222-4222-8222-222222222222.mp3', 'audio/mpeg', 1,
        'ea111111-1111-4111-8111-111111111111') $$,
  '23503', 'genre not found',
  'nor create a track in it'
);
select lives_ok(
  $$ update public.tracks set genre_id = (select id from public.genres where user_id is null limit 1)
     where id = 'b1111111-1111-4111-8111-111111111111' $$,
  'B can use a built-in genre'
);
select lives_ok(
  $$ update public.tracks set genre_id = 'eb111111-1111-4111-8111-111111111111'
     where id = 'b1111111-1111-4111-8111-111111111111' $$,
  'B can use own custom genre'
);

-- -----------------------------------------------------------------------------
-- User A: own genre, and its deletion
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "role": "authenticated"}', true);

select lives_ok(
  $$ update public.tracks set title = 'Track A, renamed' where id = 'a1111111-1111-4111-8111-111111111111' $$,
  'an edit that leaves the genre alone is not checked again'
);
-- Deleting a genre sets its tracks' genre to null: a change the check lets through.
delete from public.genres where id = 'ea111111-1111-4111-8111-111111111111';
select is(
  (select genre_id from public.tracks where id = 'a1111111-1111-4111-8111-111111111111'),
  null,
  'deleting a genre still clears it from its tracks'
);

select * from finish();
rollback;
