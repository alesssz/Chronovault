-- =============================================================================
-- Playlist entry rules (pgTAP, …_playlist_track_rules.sql): an entry can
-- never be pointed at someone else's track, and a playlist never holds more
-- than 1000 tracks, whether written through the app's functions or straight
-- into the table through the Data API.
-- Run with:  make db-test   (or: pnpm test:db)
-- Everything runs in a transaction that is rolled back: the DB stays clean.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;

select plan(10);

-- -----------------------------------------------------------------------------
-- Fixtures (inserted as superuser, so RLS does not apply)
--   user A: 1001 tracks ("Track 0001"… "Track 1001", ids a0000000-…-000000000001…1001)
--           and an empty playlist
--   user B: one track, in a playlist of B's, shared by link
-- -----------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local');

-- A's tracks: track n has the id a0000000-0000-4000-8000-<n on 12 digits>, so a test can name
-- one without reading it, and each file sits at its exact path (…_storage_path_rules.sql).
insert into public.tracks (id, user_id, title, audio_path, mime_type, size_bytes)
select t.id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', format('Track %s', lpad(t.n::text, 4, '0')),
       format('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/%s.flac', t.id), 'audio/flac', 1
from (select format('a0000000-0000-4000-8000-%s', lpad(n::text, 12, '0'))::uuid as id, n
      from generate_series(1, 1001) as n) as t;

insert into public.tracks (id, user_id, title, audio_path, mime_type, size_bytes) values
  ('b1111111-1111-4111-8111-111111111111', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Track B',
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/b1111111-1111-4111-8111-111111111111.flac', 'audio/flac', 1);

insert into public.playlists (id, user_id, title, visibility) values
  ('c1111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'A''s list', 'private'),
  ('d1111111-1111-4111-8111-111111111111', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'B''s list', 'unlisted');

insert into public.playlist_tracks (playlist_id, track_id, position) values
  ('d1111111-1111-4111-8111-111111111111', 'b1111111-1111-4111-8111-111111111111', 0);

-- -----------------------------------------------------------------------------
-- Privileges: signed-in users read, add and remove entries, never update them
-- -----------------------------------------------------------------------------
select table_privs_are('public', 'playlist_tracks', 'authenticated', array['SELECT', 'INSERT', 'DELETE'],
  'signed-in users can read, add and remove playlist entries, but not update them');
select ok(
  not has_function_privilege('authenticated', 'private.enforce_playlist_size()', 'execute')
    and not has_function_privilege('anon', 'private.enforce_playlist_size()', 'execute'),
  'the size check is fired by its trigger only, never called'
);

-- -----------------------------------------------------------------------------
-- User B: cannot point an entry of their own shared playlist at A's track
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "role": "authenticated"}', true);

-- Before: the update policy checked the playlist only, and this put A's track on B's share page
-- (B cannot read A's tracks, but an id is enough: the foreign key does not look at RLS).
select throws_ok(
  $$ update public.playlist_tracks set track_id = 'a0000000-0000-4000-8000-000000000001'
     where playlist_id = 'd1111111-1111-4111-8111-111111111111' $$,
  '42501', null,
  'B cannot point an entry of B''s playlist at A''s track (no direct updates at all)'
);
select throws_ok(
  $$ update public.playlist_tracks set position = 5
     where playlist_id = 'd1111111-1111-4111-8111-111111111111' $$,
  '42501', null,
  'not even a harmless one: a reorder rewrites the list through set_playlist_tracks'
);

-- Checked as the superuser: B's playlist still holds B's own track only.
reset role;
select results_eq(
  $$ select track_id::text from public.playlist_tracks where playlist_id = 'd1111111-1111-4111-8111-111111111111' $$,
  $$ values ('b1111111-1111-4111-8111-111111111111') $$,
  'B''s shared playlist still holds B''s own track only'
);

-- -----------------------------------------------------------------------------
-- User A: at most 1000 tracks per playlist, through the functions and directly
-- (A reads only A's own tracks: the lists below are A's 1001, or 1000 of them)
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "role": "authenticated"}', true);

-- Before: set_playlist_tracks had no limit of its own and stored all 1001.
select throws_ok(
  $$ select public.set_playlist_tracks('c1111111-1111-4111-8111-111111111111',
       array(select id from public.tracks order by title)) $$,
  '23514', 'a playlist holds at most 1000 tracks',
  'a list of 1001 tracks is refused, and nothing is written'
);
select lives_ok(
  $$ select public.set_playlist_tracks('c1111111-1111-4111-8111-111111111111',
       array(select id from public.tracks where title <> 'Track 1001' order by title)) $$,
  'a list of exactly 1000 tracks is stored'
);
-- Before: a row inserted straight into the table was not counted at all.
select throws_ok(
  $$ insert into public.playlist_tracks (playlist_id, track_id, position)
     select 'c1111111-1111-4111-8111-111111111111', id, 1000 from public.tracks where title = 'Track 1001' $$,
  '23514', 'a playlist holds at most 1000 tracks',
  'a 1001st entry inserted directly is refused'
);
select throws_ok(
  $$ select public.append_playlist_tracks('c1111111-1111-4111-8111-111111111111',
       array(select id from public.tracks where title = 'Track 1001')) $$,
  '23514', 'a playlist holds at most 1000 tracks',
  'appending a 1001st track is refused too (the same trigger)'
);
select is(
  (select count(*)::integer from public.playlist_tracks where playlist_id = 'c1111111-1111-4111-8111-111111111111'),
  1000,
  'the full playlist keeps its 1000 tracks'
);

select * from finish();
rollback;
