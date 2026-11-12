-- =============================================================================
-- Storage paths (pgTAP, …_storage_path_rules.sql): a signed-in user writing
-- their own rows straight through the Data API (no app server in between)
-- can only name their own files, by the exact paths the app builds:
--   tracks.audio_path     <user_id>/<id>.<extension>, or <user_id>/<id>.<revision>.<extension>
--                         for a replaced file (8 lower-case hex, …_replace_audio.sql)
--   tracks.cover_path     <user_id>/<id>.webp
--   playlists.cover_path  <user_id>/playlists/<id>.webp
-- A `..` reaching another user's file, another folder, another track's
-- name or a nested folder is refused (23514), on insert and on update.
-- Run with:  make db-test   (or: pnpm test:db)
-- Everything runs in a transaction that is rolled back: the DB stays clean.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;

select plan(19);

-- -----------------------------------------------------------------------------
-- Fixtures (inserted as superuser): user A (the one writing), user B (whose
-- files A must never reach) and one track of B's.
-- -----------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local');

insert into public.tracks (id, user_id, title, audio_path, mime_type, size_bytes) values
  ('b1111111-1111-4111-8111-111111111111', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'B''s track',
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/b1111111-1111-4111-8111-111111111111.flac', 'audio/flac', 1);

-- -----------------------------------------------------------------------------
-- As user A, through the Data API
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "role": "authenticated"}', true);

-- Tracks: the audio path.
select lives_ok(
  $$ insert into public.tracks (id, user_id, title, audio_path, mime_type, size_bytes) values
     ('a1111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Mine',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/a1111111-1111-4111-8111-111111111111.flac', 'audio/flac', 1) $$,
  'a track names its own audio file: <user_id>/<id>.<extension>'
);
select throws_ok(
  $$ insert into public.tracks (id, user_id, title, audio_path, mime_type, size_bytes) values
     ('a2222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Forged',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/../bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/b1111111-1111-4111-8111-111111111111.flac', 'audio/flac', 1) $$,
  '23514', null,
  'a `..` reaching another user''s audio file is refused (it starts with the own folder)'
);
select throws_ok(
  $$ insert into public.tracks (id, user_id, title, audio_path, mime_type, size_bytes) values
     ('a2222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Forged',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/%2E%2E/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/b1111111-1111-4111-8111-111111111111.flac', 'audio/flac', 1) $$,
  '23514', null,
  'an encoded `..` (%2E%2E) is refused too'
);
select throws_ok(
  $$ insert into public.tracks (id, user_id, title, audio_path, mime_type, size_bytes) values
     ('a2222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Forged',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/a1111111-1111-4111-8111-111111111111.flac', 'audio/flac', 1) $$,
  '23514', null,
  'a track cannot name another track''s file, even an own one'
);
select throws_ok(
  $$ insert into public.tracks (id, user_id, title, audio_path, mime_type, size_bytes) values
     ('a2222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Forged',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/sub/a2222222-2222-4222-8222-222222222222.flac', 'audio/flac', 1) $$,
  '23514', null,
  'no nested folder'
);
select throws_ok(
  $$ update public.tracks
     set audio_path = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/../bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/b1111111-1111-4111-8111-111111111111.flac'
     where id = 'a1111111-1111-4111-8111-111111111111' $$,
  '23514', null,
  'an existing track cannot be pointed at another user''s file either'
);

-- Tracks: a replaced audio file (…_replace_audio.sql), <user_id>/<id>.<revision>.<extension>.
select lives_ok(
  $$ update public.tracks
     set audio_path = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/a1111111-1111-4111-8111-111111111111.0a1b2c3d.flac'
     where id = 'a1111111-1111-4111-8111-111111111111' $$,
  'a replaced audio file names its own track too: <user_id>/<id>.<8 hex>.<extension>'
);
select throws_ok(
  $$ update public.tracks
     set audio_path = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/a1111111-1111-4111-8111-111111111111.0a1b2c.flac'
     where id = 'a1111111-1111-4111-8111-111111111111' $$,
  '23514', null,
  'a revision is exactly 8 characters'
);
select throws_ok(
  $$ update public.tracks
     set audio_path = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/a1111111-1111-4111-8111-111111111111.0A1B2C3D.flac'
     where id = 'a1111111-1111-4111-8111-111111111111' $$,
  '23514', null,
  'a revision is lower-case hex, as the server draws it'
);
select throws_ok(
  $$ update public.tracks
     set audio_path = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/b1111111-1111-4111-8111-111111111111.0a1b2c3d.flac'
     where id = 'a1111111-1111-4111-8111-111111111111' $$,
  '23514', null,
  'a revision of another track''s file is refused'
);
select throws_ok(
  $$ update public.tracks
     set audio_path = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/a1111111-1111-4111-8111-111111111111.0a1b2c3d.0a1b2c3d.flac'
     where id = 'a1111111-1111-4111-8111-111111111111' $$,
  '23514', null,
  'one revision at most'
);

-- Tracks: the cover path.
select lives_ok(
  $$ update public.tracks
     set cover_path = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/a1111111-1111-4111-8111-111111111111.webp'
     where id = 'a1111111-1111-4111-8111-111111111111' $$,
  'a track names its own cover: <user_id>/<id>.webp'
);
select throws_ok(
  $$ update public.tracks
     set cover_path = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/../bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/b1111111-1111-4111-8111-111111111111.webp'
     where id = 'a1111111-1111-4111-8111-111111111111' $$,
  '23514', null,
  'a `..` reaching another user''s cover is refused'
);
select throws_ok(
  $$ update public.tracks
     set cover_path = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/a1111111-1111-4111-8111-111111111111.png'
     where id = 'a1111111-1111-4111-8111-111111111111' $$,
  '23514', null,
  'a cover is always the WebP the app makes'
);
select lives_ok(
  $$ update public.tracks set cover_path = null where id = 'a1111111-1111-4111-8111-111111111111' $$,
  'a track may have no cover'
);

-- Playlists: the custom cover.
select lives_ok(
  $$ insert into public.playlists (id, user_id, title, cover_path) values
     ('c1111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Mine',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/playlists/c1111111-1111-4111-8111-111111111111.webp') $$,
  'a playlist names its own cover: <user_id>/playlists/<id>.webp'
);
select throws_ok(
  $$ insert into public.playlists (id, user_id, title, cover_path) values
     ('c2222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Forged',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/../bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/b1111111-1111-4111-8111-111111111111.webp') $$,
  '23514', null,
  'a playlist cover cannot reach another user''s file'
);
select throws_ok(
  $$ insert into public.playlists (id, user_id, title, cover_path) values
     ('c2222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Forged',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/a1111111-1111-4111-8111-111111111111.webp') $$,
  '23514', null,
  'a playlist cover cannot be a track''s cover'
);

reset role;
-- Nothing forged got in: A has exactly the one track and the one playlist that were allowed.
select results_eq(
  $$ select (select count(*) from public.tracks where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')::int,
            (select count(*) from public.playlists where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')::int $$,
  $$ values (1, 1) $$,
  'only the rows with exact paths were written'
);

select * from finish();
rollback;
