-- =============================================================================
-- Playlist security tests (pgTAP): ownership, sharing by link, storage,
-- purposes (curated playlists and groups of versions).
-- Run with:  make db-test   (or: pnpm test:db)
-- Everything runs in a transaction that is rolled back: the DB stays clean.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;

select plan(37);

-- -----------------------------------------------------------------------------
-- Fixtures (inserted as superuser, so RLS does not apply)
--   user A: a private and an unlisted track; a private and an unlisted playlist,
--           both containing both tracks
--   user B: one track
-- -----------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local');

insert into public.tracks (id, user_id, title, audio_path, cover_path, mime_type, size_bytes, visibility, suno_prompt, mastered) values
  ('a1111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Private A',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/a1111111-1111-4111-8111-111111111111.flac', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/a1111111-1111-4111-8111-111111111111.webp', 'audio/flac', 1, 'private', 'secret prompt', true),
  ('a2222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Unlisted A',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/a2222222-2222-4222-8222-222222222222.flac', null, 'audio/flac', 1, 'unlisted', null, false),
  ('b1111111-1111-4111-8111-111111111111', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Track B',
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/b1111111-1111-4111-8111-111111111111.flac', null, 'audio/flac', 1, 'private', null, false);

insert into public.playlists (id, user_id, title, visibility, cover_path) values
  ('c1111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Private list', 'private',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/playlists/c1111111-1111-4111-8111-111111111111.webp'),
  ('c2222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Shared list', 'unlisted',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/playlists/c2222222-2222-4222-8222-222222222222.webp');

insert into public.playlist_tracks (playlist_id, track_id, position) values
  ('c1111111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-111111111111', 0),
  ('c2222222-2222-4222-8222-222222222222', 'a2222222-2222-4222-8222-222222222222', 0),
  ('c2222222-2222-4222-8222-222222222222', 'a1111111-1111-4111-8111-111111111111', 1);

insert into storage.objects (bucket_id, name) values
  ('covers', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/a1111111-1111-4111-8111-111111111111.webp'),
  ('covers', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/playlists/c1111111-1111-4111-8111-111111111111.webp'),
  ('covers', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/playlists/c2222222-2222-4222-8222-222222222222.webp');

-- -----------------------------------------------------------------------------
-- Table privileges
-- -----------------------------------------------------------------------------
select table_privs_are('public', 'playlists', 'anon', array[]::text[],
  'anonymous visitors cannot touch the playlists table');
select table_privs_are('public', 'playlist_tracks', 'anon', array[]::text[],
  'anonymous visitors cannot touch the playlist_tracks table');

-- -----------------------------------------------------------------------------
-- Purposes: a playlist is a curated one unless created as a group of versions
-- -----------------------------------------------------------------------------
select results_eq(
  $$ select purpose::text from public.playlists where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' order by title $$,
  $$ values ('playlist'), ('playlist') $$,
  'playlists created without a purpose are curated playlists'
);

-- -----------------------------------------------------------------------------
-- User B
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "role": "authenticated"}', true);

select is_empty($$ select 1 from public.playlists $$, 'B cannot see A''s playlists, not even shared ones');
select is_empty($$ select 1 from public.playlist_tracks $$, 'B cannot see the content of A''s playlists');

select is_empty(
  $$ update public.playlists set title = 'hack' where id = 'c2222222-2222-4222-8222-222222222222' returning id $$,
  'B cannot rename A''s playlists'
);

select throws_ok(
  $$ insert into public.playlist_tracks (playlist_id, track_id, position)
     values ('c2222222-2222-4222-8222-222222222222', 'b1111111-1111-4111-8111-111111111111', 9) $$,
  '42501', null,
  'B cannot add tracks to A''s playlists'
);

select throws_ok(
  $$ select public.set_playlist_tracks('c2222222-2222-4222-8222-222222222222', array[]::uuid[]) $$,
  'P0002', null,
  'B cannot empty A''s playlists'
);

select lives_ok(
  $$ insert into public.playlists (id, title) values ('d1111111-1111-4111-8111-111111111111', 'B''s list') $$,
  'B creates own playlists (user_id defaults to auth.uid())'
);

select throws_ok(
  $$ insert into public.playlist_tracks (playlist_id, track_id, position)
     values ('d1111111-1111-4111-8111-111111111111', 'a2222222-2222-4222-8222-222222222222', 0) $$,
  '42501', null,
  'B cannot put A''s tracks in own playlists'
);

select lives_ok(
  $$ select public.set_playlist_tracks('d1111111-1111-4111-8111-111111111111', array['b1111111-1111-4111-8111-111111111111']::uuid[]) $$,
  'B fills own playlists with own tracks'
);

select results_eq(
  $$ select title from public.get_shared_playlist_tracks('c2222222-2222-4222-8222-222222222222') $$,
  $$ values ('Unlisted A'), ('Private A') $$,
  'a shared playlist lists all its tracks in order, private ones included'
);

-- -----------------------------------------------------------------------------
-- User A
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "role": "authenticated"}', true);

select lives_ok(
  $$ select public.set_playlist_tracks('c2222222-2222-4222-8222-222222222222',
       array['a1111111-1111-4111-8111-111111111111', 'a2222222-2222-4222-8222-222222222222']::uuid[]) $$,
  'A reorders own playlists'
);

select results_eq(
  $$ select track_id::text from public.playlist_tracks
     where playlist_id = 'c2222222-2222-4222-8222-222222222222' order by position $$,
  $$ values ('a1111111-1111-4111-8111-111111111111'), ('a2222222-2222-4222-8222-222222222222') $$,
  'set_playlist_tracks stores the new order'
);

-- Appending (…_playlist_track_writes.sql): at the end, in order, each track once, never twice.
select lives_ok(
  $$ select public.append_playlist_tracks('c1111111-1111-4111-8111-111111111111',
       array['a2222222-2222-4222-8222-222222222222', 'a1111111-1111-4111-8111-111111111111',
             'a2222222-2222-4222-8222-222222222222']::uuid[]) $$,
  'A appends tracks to own playlist'
);
select results_eq(
  $$ select track_id::text, position from public.playlist_tracks
     where playlist_id = 'c1111111-1111-4111-8111-111111111111' order by position $$,
  $$ values ('a1111111-1111-4111-8111-111111111111', 0), ('a2222222-2222-4222-8222-222222222222', 1) $$,
  'an append goes after the tracks there, skipping one already in the list and one given twice'
);
select throws_ok(
  $$ select public.append_playlist_tracks('c1111111-1111-4111-8111-111111111111',
       array['b1111111-1111-4111-8111-111111111111']::uuid[]) $$,
  'P0002', null,
  'someone else''s track cannot be appended: "not found" (404), like any item that is not the caller''s'
);
select throws_ok(
  $$ select public.set_playlist_tracks('c1111111-1111-4111-8111-111111111111',
       array['a1111111-1111-4111-8111-111111111111', 'b1111111-1111-4111-8111-111111111111']::uuid[]) $$,
  'P0002', null,
  'a list holding someone else''s track is refused as "not found", and nothing is written'
);
select throws_ok(
  $$ select public.append_playlist_tracks('c1111111-1111-4111-8111-111111111111',
       array['e9999999-9999-4999-8999-999999999999']::uuid[]) $$,
  'P0002', null,
  'a track that does not exist is "not found" too'
);
select throws_ok(
  $$ select public.append_playlist_tracks('d1111111-1111-4111-8111-111111111111',
       array['a1111111-1111-4111-8111-111111111111']::uuid[]) $$,
  'P0002', null,
  'nothing can be appended to someone else''s playlist'
);

select throws_ok(
  $$ update public.playlists set user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
     where id = 'c2222222-2222-4222-8222-222222222222' $$,
  'P0001', 'user_id cannot be changed',
  'the owner of a playlist cannot be changed'
);

-- -----------------------------------------------------------------------------
-- Anonymous visitor
-- -----------------------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);

select throws_ok($$ select 1 from public.playlists $$, '42501', null,
  'an anonymous visitor cannot read the playlists table');

select results_eq(
  $$ select title from public.get_shared_playlist('c2222222-2222-4222-8222-222222222222') $$,
  $$ values ('Shared list') $$,
  'an anonymous visitor opens an unlisted playlist by its link'
);

select is_empty(
  $$ select 1 from public.get_shared_playlist('c1111111-1111-4111-8111-111111111111') $$,
  'an anonymous visitor cannot open a private playlist'
);

select results_eq(
  $$ select purpose::text from public.get_shared_playlist('c2222222-2222-4222-8222-222222222222') $$,
  $$ values ('playlist') $$,
  'a shared playlist says its purpose (the page words a group of versions differently)'
);

select is_empty(
  $$ select 1 from public.get_shared_playlist_tracks('c1111111-1111-4111-8111-111111111111') $$,
  'the tracks of a private playlist stay hidden'
);

select is_empty(
  $$ select 1
     from pg_proc p, unnest(p.proargnames) as arg(name)
     where p.oid = 'public.get_shared_playlist_tracks(uuid)'::regprocedure
       and arg.name in ('suno_prompt', 'mastered', 'user_id') $$,
  'shared playlists never expose the Suno prompt, the mastering status or the owner'
);

select isnt_empty(
  $$ select 1
     from pg_proc p, unnest(p.proargnames) as arg(name)
     where p.oid = 'public.get_shared_playlist_tracks(uuid)'::regprocedure
       and arg.name = 'status' $$,
  'shared playlists return each track''s draft/final status ("Work in progress" marks)'
);

select is_empty(
  $$ select 1 from public.get_shared_track('a1111111-1111-4111-8111-111111111111') $$,
  'a private track inside a shared playlist still has no page of its own'
);

-- Signed by name only (…_storage_sign_only.sql): Storage names each request's operation, set here by hand.
select set_config('storage.operation', 'storage.object.sign_many', true);
select results_eq(
  $$ select name from storage.objects where bucket_id = 'covers' and name like 'aaaaaaaa%' order by name $$,
  $$ values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/a1111111-1111-4111-8111-111111111111.webp'),
            ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/playlists/c2222222-2222-4222-8222-222222222222.webp') $$,
  'visitors read the covers of shared playlists and of the tracks in them, nothing else, to sign them'
);
-- Before: the list endpoint returned the same names, the playlist's id among them.
select set_config('storage.operation', 'storage.object.list', true);
select is_empty(
  $$ select 1 from storage.objects where bucket_id = 'covers' and name like 'aaaaaaaa%' $$,
  'visitors cannot list the covers of shared playlists and tracks'
);
-- Back to no operation named, as the checks below expect.
select set_config('storage.operation', '', true);

-- The share page's lookups (…_shared_playlist_lookups.sql): one path each, same rule as the list.
select is(
  public.get_shared_playlist_track_audio('c2222222-2222-4222-8222-222222222222', 'a1111111-1111-4111-8111-111111111111'),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/a1111111-1111-4111-8111-111111111111.flac',
  'a visitor gets the audio file of a track (even a private one) through the shared playlist holding it'
);
select is(
  public.get_shared_playlist_track_audio('c2222222-2222-4222-8222-222222222222', 'b1111111-1111-4111-8111-111111111111'),
  null,
  'no audio file for a track that is not in the playlist'
);
select is(
  public.get_shared_playlist_track_audio('c1111111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-111111111111'),
  null,
  'no audio file through a private playlist'
);
select is(
  public.get_shared_playlist_cover('c2222222-2222-4222-8222-222222222222'),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/playlists/c2222222-2222-4222-8222-222222222222.webp',
  'a shared playlist shows its own cover'
);
select is(
  public.get_shared_playlist_cover('c1111111-1111-4111-8111-111111111111'),
  null,
  'no cover for a private playlist'
);

-- Without a cover of its own, the first track's that has one, in playlist order. The track
-- without a cover goes first, so the check really skips it: in the order A left above, the first
-- track had a cover, and a lookup that never skipped anything passed all the same.
reset role;
update public.playlists set cover_path = null where id = 'c2222222-2222-4222-8222-222222222222';
update public.playlist_tracks
set position = case track_id when 'a2222222-2222-4222-8222-222222222222' then 0 else 1 end
where playlist_id = 'c2222222-2222-4222-8222-222222222222';
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
select is(
  public.get_shared_playlist_cover('c2222222-2222-4222-8222-222222222222'),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/a1111111-1111-4111-8111-111111111111.webp',
  'without its own cover, a shared playlist shows the first track cover it holds, past a track without one (the mosaic''s first tile)'
);

select * from finish();
rollback;
