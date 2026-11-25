-- =============================================================================
-- Storage writes and a track's size (pgTAP, …_storage_writes_and_track_limits.sql):
-- a signed-in user, with the public key and their session, writes covers only,
-- under the names a row can point to, and cannot store oversized or malformed
-- waveform, synced lyrics or MIME type in their own tracks through the Data API.
-- Run with:  make db-test   (or: pnpm test:db)
-- Everything runs in a transaction that is rolled back: the DB stays clean.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;

select plan(22);

-- -----------------------------------------------------------------------------
-- Fixtures (inserted as superuser): user A and one of A's tracks
-- -----------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local');

insert into public.tracks (id, user_id, title, audio_path, mime_type, size_bytes) values
  ('a1111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Mine',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/a1111111-1111-4111-8111-111111111111.flac', 'audio/flac', 1);

-- A file stored under the old rules, to delete below.
insert into storage.objects (bucket_id, name) values
  ('covers', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/old-name.png');

-- Storage itself enforces the bucket's limits on upload; read here as the superuser (the
-- buckets are not visible to users).
select is(
  (select row(file_size_limit, allowed_mime_types)::text from storage.buckets where id = 'covers'),
  row(3145728::bigint, array['image/webp'])::text,
  'the covers bucket takes WebP of up to 3 MB'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "role": "authenticated"}', true);

-- -----------------------------------------------------------------------------
-- Storage: covers only, by the names rows point to
-- -----------------------------------------------------------------------------
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('audio', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/a1111111-1111-4111-8111-111111111111.flac') $$,
  '42501', null,
  'nobody signed in writes the audio bucket, not even in their own folder'
);
select lives_ok(
  $$ insert into storage.objects (bucket_id, name) values ('covers', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/a1111111-1111-4111-8111-111111111111.webp') $$,
  'a track''s cover: <user_id>/<uuid>.webp'
);
select lives_ok(
  $$ insert into storage.objects (bucket_id, name) values ('covers', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/playlists/c1111111-1111-4111-8111-111111111111.webp') $$,
  'a playlist''s cover: <user_id>/playlists/<uuid>.webp'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('covers', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/backup.zip') $$,
  '42501', null,
  'any other name in the own folder is refused'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('covers', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/a2222222-2222-4222-8222-222222222222.png') $$,
  '42501', null,
  'a cover is WebP'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('covers', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/deep/a2222222-2222-4222-8222-222222222222.webp') $$,
  '42501', null,
  'no folder of one''s own making'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('covers', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/a2222222-2222-4222-8222-222222222222.webp') $$,
  '42501', null,
  'no cover in another user''s folder'
);
select throws_ok(
  $$ update storage.objects set name = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/renamed.bin'
     where name = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/a1111111-1111-4111-8111-111111111111.webp' $$,
  '42501', null,
  'a cover cannot be renamed to another name either'
);
-- Storage sets this for its own delete requests; a bare DELETE is refused by its trigger.
select set_config('storage.allow_delete_query', 'true', true);
select results_eq(
  $$ with gone as (delete from storage.objects where name = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/old-name.png' returning 1)
     select count(*)::int from gone $$,
  $$ values (1) $$,
  'a file stored under the old rules can still be deleted'
);

-- -----------------------------------------------------------------------------
-- A track's waveform, synced lyrics and MIME type, written straight through the Data API
-- -----------------------------------------------------------------------------
select lives_ok(
  $$ update public.tracks set peaks = (select jsonb_agg(0.5) from generate_series(1, 1000)),
       lyrics_synced = (select jsonb_agg(jsonb_build_object('time', n, 'text', repeat('è', 500), 'section', n = 1))
                        from generate_series(1, 2000) n)
     where id = 'a1111111-1111-4111-8111-111111111111' $$,
  'the largest waveform and synced lyrics the API takes are stored'
);
select throws_ok(
  $$ update public.tracks set peaks = (select jsonb_agg(0.5) from generate_series(1, 1001))
     where id = 'a1111111-1111-4111-8111-111111111111' $$,
  '23514', null,
  'a waveform of more than 1000 peaks is refused'
);
select throws_ok(
  $$ update public.tracks set peaks = '[0.5, 1.5]' where id = 'a1111111-1111-4111-8111-111111111111' $$,
  '23514', null,
  'a peak above 1 is refused'
);
select throws_ok(
  $$ update public.tracks set peaks = '[0.5, "x"]' where id = 'a1111111-1111-4111-8111-111111111111' $$,
  '23514', null,
  'a peak that is not a number is refused'
);
select throws_ok(
  $$ update public.tracks set peaks = '[[0.5]]' where id = 'a1111111-1111-4111-8111-111111111111' $$,
  '23514', null,
  'an array nested in the waveform is refused'
);
select throws_ok(
  $$ update public.tracks set lyrics_synced = (select jsonb_agg(jsonb_build_object('time', n, 'text', 'a')) from generate_series(1, 2001) n)
     where id = 'a1111111-1111-4111-8111-111111111111' $$,
  '23514', null,
  'more than 2000 synced lines are refused'
);
select throws_ok(
  $$ update public.tracks set lyrics_synced = jsonb_build_array(jsonb_build_object('time', 1, 'text', repeat('a', 501)))
     where id = 'a1111111-1111-4111-8111-111111111111' $$,
  '23514', null,
  'a synced line over 500 characters is refused'
);
select throws_ok(
  $$ update public.tracks set lyrics_synced = '[{"time": 1, "text": "a", "padding": "x"}]'
     where id = 'a1111111-1111-4111-8111-111111111111' $$,
  '23514', null,
  'a synced line with a key of its own is refused (no room for hidden data)'
);
select throws_ok(
  $$ update public.tracks set lyrics_synced = '[{"text": "a"}]' where id = 'a1111111-1111-4111-8111-111111111111' $$,
  '23514', null,
  'a synced line without its time is refused'
);
select throws_ok(
  $$ update public.tracks set lyrics_synced = '[{"time": -1, "text": "a"}]' where id = 'a1111111-1111-4111-8111-111111111111' $$,
  '23514', null,
  'a negative time is refused'
);
select throws_ok(
  $$ update public.tracks set mime_type = 'text/html' where id = 'a1111111-1111-4111-8111-111111111111' $$,
  '23514', null,
  'a MIME type other than audio/… is refused'
);
select throws_ok(
  $$ update public.tracks set mime_type = 'audio/' || repeat('x', 100) where id = 'a1111111-1111-4111-8111-111111111111' $$,
  '23514', null,
  'a MIME type over 100 characters is refused'
);

select * from finish();
rollback;
