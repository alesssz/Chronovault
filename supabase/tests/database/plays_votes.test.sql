-- =============================================================================
-- Plays and version votes (pgTAP): who may record a play and in which
-- context, own plays kept apart, one play per listener and day, votes only
-- on shared groups of versions, never by the owner, closed once a version
-- is final, and readable by the owner only.
-- Run with:  make db-test   (or: pnpm test:db)
-- Everything runs in a transaction that is rolled back: the DB stays clean.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;

select plan(42);

-- -----------------------------------------------------------------------------
-- Fixtures (inserted as superuser, so RLS does not apply)
--   user A: a1 and a3, private drafts (two versions of a song);
--           a2, unlisted; a4, private and in no playlist
--           g1: an unlisted group of versions with a1 and a3
--           pp: a private playlist with a2
--   user B: no data, a signed-in visitor
--   visitors' browser ids: f1… and f2… (listeners), e1… and e2… (voters),
--   f9… and e9… (sent by the owner, who is recognised by the session instead)
-- -----------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local');

insert into public.tracks (id, user_id, title, audio_path, mime_type, size_bytes, visibility, status) values
  ('a1111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Song (v1)',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/a1.flac', 'audio/flac', 1, 'private', 'draft'),
  ('a2222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Unlisted A',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/a2.flac', 'audio/flac', 1, 'unlisted', 'final'),
  ('a3333333-3333-4333-8333-333333333333', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Song (v2)',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/a3.flac', 'audio/flac', 1, 'private', 'draft'),
  ('a4444444-4444-4444-8444-444444444444', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Private A',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/a4.flac', 'audio/flac', 1, 'private', 'final');

insert into public.playlists (id, user_id, title, visibility, purpose) values
  ('c1111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Song – versions', 'unlisted', 'versions'),
  ('c2222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Private list', 'private', 'playlist');

insert into public.playlist_tracks (playlist_id, track_id, position) values
  ('c1111111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-111111111111', 0),
  ('c1111111-1111-4111-8111-111111111111', 'a3333333-3333-4333-8333-333333333333', 1),
  ('c2222222-2222-4222-8222-222222222222', 'a2222222-2222-4222-8222-222222222222', 0);

-- -----------------------------------------------------------------------------
-- Table privileges: visitors go through the functions only
-- -----------------------------------------------------------------------------
select table_privs_are('public', 'plays', 'anon', array[]::text[],
  'anonymous visitors cannot touch the plays table');
select table_privs_are('public', 'version_votes', 'anon', array[]::text[],
  'anonymous visitors cannot touch the version_votes table');
select table_privs_are('public', 'plays', 'authenticated', array['SELECT'],
  'signed-in users can only read plays (RLS: their own tracks)');
select table_privs_are('public', 'version_votes', 'authenticated', array['SELECT'],
  'signed-in users can only read votes (RLS: their own groups)');

-- The internal helpers are not part of the API (Supabase's default privileges
-- would grant them to anon and authenticated: the migration revokes them).
select ok(
  not has_function_privilege('anon', 'public.shared_group_owner(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.shared_group_owner(uuid)', 'execute'),
  'shared_group_owner (it returns the owner''s id) cannot be called through the API'
);
select ok(
  not has_function_privilege('anon', 'public.version_voting_open(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.version_voting_open(uuid)', 'execute'),
  'version_voting_open cannot be called through the API'
);
select ok(
  not has_function_privilege('anon', 'public.check_version_voting(uuid, uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.check_version_voting(uuid, uuid)', 'execute'),
  'check_version_voting cannot be called through the API'
);

-- -----------------------------------------------------------------------------
-- An anonymous visitor
-- -----------------------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);

-- Plays: only where the visitor can listen
select lives_ok(
  $$ select public.record_play('a2222222-2222-4222-8222-222222222222', null, 'f1111111-1111-4111-8111-111111111111', false) $$,
  'a visitor records a play of an unlisted track on its own page'
);
select throws_ok(
  $$ select public.record_play('a1111111-1111-4111-8111-111111111111', null, 'f1111111-1111-4111-8111-111111111111', false) $$,
  'P0002', null,
  'a private track has no page of its own: no play there'
);
select lives_ok(
  $$ select public.record_play('a1111111-1111-4111-8111-111111111111', 'c1111111-1111-4111-8111-111111111111', 'f1111111-1111-4111-8111-111111111111', false) $$,
  'a private track is played through the shared group that contains it'
);
select throws_ok(
  $$ select public.record_play('a2222222-2222-4222-8222-222222222222', 'c2222222-2222-4222-8222-222222222222', 'f1111111-1111-4111-8111-111111111111', false) $$,
  'P0002', null,
  'no play through a private playlist'
);
select throws_ok(
  $$ select public.record_play('a2222222-2222-4222-8222-222222222222', 'c1111111-1111-4111-8111-111111111111', 'f1111111-1111-4111-8111-111111111111', false) $$,
  'P0002', null,
  'no play through a shared playlist that does not contain the track'
);
select throws_ok(
  $$ select public.record_play('a2222222-2222-4222-8222-222222222222', null, null, false) $$,
  '22P02', null,
  'a visitor must send their browser id'
);
-- The same listener the same day: the play becomes completed, no second row.
select lives_ok(
  $$ select public.record_play('a2222222-2222-4222-8222-222222222222', null, 'f1111111-1111-4111-8111-111111111111', true) $$,
  'listening to the end updates today''s play'
);
select lives_ok(
  $$ select public.record_play('a2222222-2222-4222-8222-222222222222', null, 'f1111111-1111-4111-8111-111111111111', false) $$,
  'listening again the same day is accepted (and counted once)'
);
select throws_ok($$ select 1 from public.plays $$, '42501', null, 'visitors cannot read plays');

-- Votes
select results_eq(
  $$ select open, is_owner, track_id from public.get_version_vote('c1111111-1111-4111-8111-111111111111', 'e1111111-1111-4111-8111-111111111111') $$,
  $$ values (true, false, null::uuid) $$,
  'a new visitor of a shared group: voting open, not the owner, no pick yet'
);
select is_empty(
  $$ select 1 from public.get_version_vote('c2222222-2222-4222-8222-222222222222', 'e1111111-1111-4111-8111-111111111111') $$,
  'a private playlist has no vote to show'
);
select lives_ok(
  $$ select public.cast_version_vote('c1111111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-111111111111',
       'e1111111-1111-4111-8111-111111111111', 'Marco', 'Great chorus') $$,
  'a visitor picks a version, with a name and a comment'
);
select lives_ok(
  $$ select public.cast_version_vote('c1111111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-111111111111',
       'e2222222-2222-4222-8222-222222222222', null, null) $$,
  'another visitor picks without a name or comment'
);
select lives_ok(
  $$ select public.cast_version_vote('c1111111-1111-4111-8111-111111111111', 'a3333333-3333-4333-8333-333333333333',
       'e1111111-1111-4111-8111-111111111111', 'Marco', 'Changed my mind') $$,
  'voting again changes the pick'
);
select results_eq(
  $$ select track_id, name, comment from public.get_version_vote('c1111111-1111-4111-8111-111111111111', 'e1111111-1111-4111-8111-111111111111') $$,
  $$ values ('a3333333-3333-4333-8333-333333333333'::uuid, 'Marco', 'Changed my mind') $$,
  'a visitor sees their own current pick'
);
select throws_ok(
  $$ select public.cast_version_vote('c1111111-1111-4111-8111-111111111111', 'a2222222-2222-4222-8222-222222222222',
       'e1111111-1111-4111-8111-111111111111', null, null) $$,
  'P0002', null,
  'only a version of the group can be picked'
);
select throws_ok(
  $$ select public.cast_version_vote('c2222222-2222-4222-8222-222222222222', 'a2222222-2222-4222-8222-222222222222',
       'e1111111-1111-4111-8111-111111111111', null, null) $$,
  'P0002', null,
  'no votes on a private playlist'
);
select throws_ok(
  $$ select public.cast_version_vote('c1111111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-111111111111', null, null, null) $$,
  '22P02', null,
  'a voter must send their browser id'
);
select throws_ok($$ select 1 from public.version_votes $$, '42501', null, 'visitors cannot read votes');

-- -----------------------------------------------------------------------------
-- User A, the owner
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "role": "authenticated"}', true);

select lives_ok(
  $$ select public.record_play('a4444444-4444-4444-8444-444444444444', null, null, false) $$,
  'the owner records a play of their private track (library playback), without a browser id'
);
select lives_ok(
  $$ select public.record_play('a1111111-1111-4111-8111-111111111111', 'c1111111-1111-4111-8111-111111111111', 'f9999999-9999-4999-8999-999999999999', false) $$,
  'the owner listening on their own group page is accepted'
);
select results_eq(
  $$ select track_id, playlist_id, listener::text, listener_id, completed from public.plays order by id $$,
  $$ values
       ('a2222222-2222-4222-8222-222222222222'::uuid, null::uuid, 'visitor', 'f1111111-1111-4111-8111-111111111111'::uuid, true),
       ('a1111111-1111-4111-8111-111111111111'::uuid, 'c1111111-1111-4111-8111-111111111111'::uuid, 'visitor', 'f1111111-1111-4111-8111-111111111111'::uuid, false),
       ('a4444444-4444-4444-8444-444444444444'::uuid, null::uuid, 'owner', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid, false),
       ('a1111111-1111-4111-8111-111111111111'::uuid, 'c1111111-1111-4111-8111-111111111111'::uuid, 'owner', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid, false) $$,
  'the owner reads every play of their tracks: one per listener and day, own plays marked owner under their user id'
);
select results_eq(
  $$ select track_id, name from public.version_votes order by name nulls last $$,
  $$ values ('a3333333-3333-4333-8333-333333333333'::uuid, 'Marco'), ('a1111111-1111-4111-8111-111111111111'::uuid, null) $$,
  'the owner reads the votes of their group'
);
select throws_ok(
  $$ select public.cast_version_vote('c1111111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-111111111111',
       'e9999999-9999-4999-8999-999999999999', null, null) $$,
  '42501', null,
  'the owner cannot vote on their own group'
);
select results_eq(
  $$ select is_owner from public.get_version_vote('c1111111-1111-4111-8111-111111111111', 'e9999999-9999-4999-8999-999999999999') $$,
  $$ values (true) $$,
  'the group page knows its owner (to show a note instead of the vote buttons)'
);

-- -----------------------------------------------------------------------------
-- User B, a signed-in visitor
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "role": "authenticated"}', true);

select is_empty($$ select 1 from public.plays $$, 'B cannot read the plays of A''s tracks');
select is_empty($$ select 1 from public.version_votes $$, 'B cannot read the votes of A''s groups');
select throws_ok(
  $$ select public.record_play('a4444444-4444-4444-8444-444444444444', null, 'f2222222-2222-4222-8222-222222222222', false) $$,
  'P0002', null,
  'B cannot record plays of A''s private track'
);
select lives_ok(
  $$ select public.record_play('a2222222-2222-4222-8222-222222222222', null, 'f2222222-2222-4222-8222-222222222222', false) $$,
  'B listening to A''s unlisted track is a visitor play'
);

-- -----------------------------------------------------------------------------
-- A version is chosen: voting closes; marked draft again, it reopens
-- -----------------------------------------------------------------------------
reset role;
update public.tracks set status = 'final' where id = 'a3333333-3333-4333-8333-333333333333';

set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);

select results_eq(
  $$ select open from public.get_version_vote('c1111111-1111-4111-8111-111111111111', 'e1111111-1111-4111-8111-111111111111') $$,
  $$ values (false) $$,
  'once a version is final, the group page shows voting closed'
);
select throws_ok(
  $$ select public.cast_version_vote('c1111111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-111111111111',
       'e1111111-1111-4111-8111-111111111111', null, null) $$,
  '55000', null,
  'no voting once a version is final'
);
select throws_ok(
  $$ select public.withdraw_version_vote('c1111111-1111-4111-8111-111111111111', 'e1111111-1111-4111-8111-111111111111') $$,
  '55000', null,
  'no withdrawing once a version is final'
);

reset role;
update public.tracks set status = 'draft' where id = 'a3333333-3333-4333-8333-333333333333';

set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);

select lives_ok(
  $$ select public.withdraw_version_vote('c1111111-1111-4111-8111-111111111111', 'e1111111-1111-4111-8111-111111111111') $$,
  'back to draft: voting is open again, and a visitor can withdraw their pick'
);
select results_eq(
  $$ select open, track_id from public.get_version_vote('c1111111-1111-4111-8111-111111111111', 'e1111111-1111-4111-8111-111111111111') $$,
  $$ values (true, null::uuid) $$,
  'after withdrawing, the visitor has no pick'
);

-- -----------------------------------------------------------------------------
-- A version removed from the group: its votes stop counting for that visitor
-- -----------------------------------------------------------------------------
reset role;
delete from public.playlist_tracks
where playlist_id = 'c1111111-1111-4111-8111-111111111111' and track_id = 'a1111111-1111-4111-8111-111111111111';

set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);

select results_eq(
  $$ select track_id from public.get_version_vote('c1111111-1111-4111-8111-111111111111', 'e2222222-2222-4222-8222-222222222222') $$,
  $$ values (null::uuid) $$,
  'a pick of a version removed from the group counts as no pick'
);

select * from finish();
rollback;
