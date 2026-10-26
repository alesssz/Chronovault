-- =============================================================================
-- Caps on anonymous writes (pgTAP, …_anonymous_write_caps.sql): at most 100
-- different visitors per track and day, at most 50 votes per group; a
-- listener or voter already in is never refused, the owner's own plays are
-- not capped, and yesterday's visitors leave today's places free.
-- Run with:  make db-test   (or: pnpm test:db)
-- Everything runs in a transaction that is rolled back: the DB stays clean.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;

select plan(13);

-- -----------------------------------------------------------------------------
-- Fixtures (inserted as superuser, so RLS does not apply)
--   user A: t1 (a draft) and t2, unlisted; v1 and v2, private drafts
--           g1: an unlisted group of versions with v1, v2 and t1 (all
--           drafts: a final version would close the voting)
--   visitors' browser ids: d0… (the 100th listener / 50th voter),
--   d1… (one too many), d2… (one more after a place is freed)
-- -----------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local');

insert into public.tracks (id, user_id, title, audio_path, mime_type, size_bytes, visibility, status) values
  ('71111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Track 1',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/t1.flac', 'audio/flac', 1, 'unlisted', 'draft'),
  ('72222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Track 2',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/t2.flac', 'audio/flac', 1, 'unlisted', 'final'),
  ('a1111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Song (v1)',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/v1.flac', 'audio/flac', 1, 'private', 'draft'),
  ('a2222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Song (v2)',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/v2.flac', 'audio/flac', 1, 'private', 'draft');

insert into public.playlists (id, user_id, title, visibility, purpose) values
  ('c1111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Song – versions', 'unlisted', 'versions');

insert into public.playlist_tracks (playlist_id, track_id, position) values
  ('c1111111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-111111111111', 0),
  ('c1111111-1111-4111-8111-111111111111', 'a2222222-2222-4222-8222-222222222222', 1),
  ('c1111111-1111-4111-8111-111111111111', '71111111-1111-4111-8111-111111111111', 2);

-- Track 1 today: 99 visitors already counted, one place left.
insert into public.plays (owner_id, track_id, playlist_id, listener, listener_id)
select 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '71111111-1111-4111-8111-111111111111', null, 'visitor', gen_random_uuid()
from generate_series(1, 99);

-- Track 2 yesterday: 100 visitors, a full day that is over.
insert into public.plays (owner_id, track_id, playlist_id, listener, listener_id, played_on)
select 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '72222222-2222-4222-8222-222222222222', null, 'visitor', gen_random_uuid(),
  (now() at time zone 'utc')::date - 1
from generate_series(1, 100);

-- The group: 49 votes already, one place left.
insert into public.version_votes (playlist_id, voter_id, track_id)
select 'c1111111-1111-4111-8111-111111111111', gen_random_uuid(), 'a1111111-1111-4111-8111-111111111111'
from generate_series(1, 49);

-- -----------------------------------------------------------------------------
-- Plays, as an anonymous visitor
-- -----------------------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);

select lives_ok(
  $$ select public.record_play('71111111-1111-4111-8111-111111111111', null, 'd0000000-0000-4000-8000-000000000000', false) $$,
  'the 100th visitor of a track today is counted'
);
select throws_ok(
  $$ select public.record_play('71111111-1111-4111-8111-111111111111', null, 'd1111111-1111-4111-8111-111111111111', false) $$,
  '53400', null,
  'a 101st visitor of the same track today is refused'
);
select lives_ok(
  $$ select public.record_play('71111111-1111-4111-8111-111111111111', null, 'd0000000-0000-4000-8000-000000000000', true) $$,
  'a visitor already counted today still marks the play completed'
);
select lives_ok(
  $$ select public.record_play('71111111-1111-4111-8111-111111111111', 'c1111111-1111-4111-8111-111111111111', 'd0000000-0000-4000-8000-000000000000', false) $$,
  'a visitor already counted today is not new in another context (through the group)'
);
select lives_ok(
  $$ select public.record_play('72222222-2222-4222-8222-222222222222', null, 'd1111111-1111-4111-8111-111111111111', false) $$,
  'yesterday''s visitors leave today''s places free'
);

reset role;
select results_eq(
  $$ select count(distinct listener_id)::int, bool_or(completed) from public.plays
     where track_id = '71111111-1111-4111-8111-111111111111' and listener = 'visitor' $$,
  $$ values (100, true) $$,
  'track 1 counts exactly 100 visitors today, the last one completed'
);

-- -----------------------------------------------------------------------------
-- The owner's own plays are never capped
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "role": "authenticated"}', true);

select lives_ok(
  $$ select public.record_play('71111111-1111-4111-8111-111111111111', null, null, false) $$,
  'the owner plays their own full track'
);

reset role;

-- -----------------------------------------------------------------------------
-- Votes, as an anonymous visitor
-- -----------------------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);

select lives_ok(
  $$ select public.cast_version_vote('c1111111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-111111111111', 'd0000000-0000-4000-8000-000000000000', null, null) $$,
  'the 50th vote of a group is accepted'
);
select throws_ok(
  $$ select public.cast_version_vote('c1111111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-111111111111', 'd1111111-1111-4111-8111-111111111111', null, 'one too many') $$,
  '53400', null,
  'a 51st voter is refused'
);
select lives_ok(
  $$ select public.cast_version_vote('c1111111-1111-4111-8111-111111111111', 'a2222222-2222-4222-8222-222222222222', 'd0000000-0000-4000-8000-000000000000', 'Ada', 'Changed my mind') $$,
  'a voter already in changes their pick in a full group'
);
select lives_ok(
  $$ select public.withdraw_version_vote('c1111111-1111-4111-8111-111111111111', 'd0000000-0000-4000-8000-000000000000') $$,
  'a voter takes their pick back'
);
select lives_ok(
  $$ select public.cast_version_vote('c1111111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-111111111111', 'd2222222-2222-4222-8222-222222222222', null, null) $$,
  'the place freed goes to a new voter'
);

reset role;
select is(
  (select count(*)::int from public.version_votes where playlist_id = 'c1111111-1111-4111-8111-111111111111'),
  50,
  'the group holds exactly 50 votes'
);

select * from finish();
rollback;
