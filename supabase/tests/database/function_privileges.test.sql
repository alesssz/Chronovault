-- =============================================================================
-- Function privileges (pgTAP): exactly which functions each role may call.
-- Supabase's default privileges grant `execute` on every new function in
-- `public` to anon and authenticated, and anything there is callable through
-- the Data API: these lists make a function exposed by mistake fail the
-- tests. The policy helpers live in the unexposed `private` schema and still
-- work for the policies that need them.
-- Run with:  make db-test   (or: pnpm test:db)
-- Everything runs in a transaction that is rolled back: the DB stays clean.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;

select plan(8);

-- -----------------------------------------------------------------------------
-- What the API offers, per role (functions of `public` the role may execute)
-- -----------------------------------------------------------------------------
select is(
  array(
    select p.proname::text
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
    order by 1
  ),
  array[
    'cast_version_vote', 'get_shared_playlist', 'get_shared_playlist_tracks', 'get_shared_track',
    'get_version_vote', 'record_play', 'withdraw_version_vote'
  ],
  'anonymous visitors can call exactly the sharing, plays and votes functions'
);

select is(
  array(
    select p.proname::text
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute')
    order by 1
  ),
  array[
    'cast_version_vote', 'get_shared_playlist', 'get_shared_playlist_tracks', 'get_shared_track',
    'get_version_vote', 'record_play', 'set_playlist_tracks', 'withdraw_version_vote'
  ],
  'signed-in users can call the same, plus set_playlist_tracks'
);

-- -----------------------------------------------------------------------------
-- The policy helpers: in `private`, callable only by the roles whose policies use them
-- -----------------------------------------------------------------------------
select hasnt_function('public', 'is_shared_track_file', array['text', 'text'],
  'is_shared_track_file is no longer in the API schema');
select hasnt_function('public', 'owns_playlist', array['uuid'],
  'owns_playlist is no longer in the API schema');
select ok(
  has_function_privilege('anon', 'private.is_shared_track_file(text, text)', 'execute')
    and has_function_privilege('authenticated', 'private.is_shared_track_file(text, text)', 'execute'),
  'the storage policy can still check shared files, for visitors and signed-in users'
);
select ok(
  has_function_privilege('authenticated', 'private.owns_playlist(uuid)', 'execute')
    and not has_function_privilege('anon', 'private.owns_playlist(uuid)', 'execute'),
  'owns_playlist serves the signed-in users'' policies only'
);

-- -----------------------------------------------------------------------------
-- set_playlist_tracks still works from its new helper
-- -----------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local');
insert into public.tracks (id, user_id, title, audio_path, mime_type, size_bytes) values
  ('a1111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Track',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/a1111111-1111-4111-8111-111111111111.flac', 'audio/flac', 1);
insert into public.playlists (id, user_id, title) values
  ('c1111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'List');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "role": "authenticated"}', true);

select lives_ok(
  $$ select public.set_playlist_tracks('c1111111-1111-4111-8111-111111111111', array['a1111111-1111-4111-8111-111111111111']::uuid[]) $$,
  'the owner still sets their playlist''s tracks'
);
select results_eq(
  $$ select track_id from public.playlist_tracks $$,
  $$ values ('a1111111-1111-4111-8111-111111111111'::uuid) $$,
  'and the playlist_tracks policies (owns_playlist) still let them read the result'
);

select * from finish();
rollback;
