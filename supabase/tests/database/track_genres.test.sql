-- =============================================================================
-- Genres and subgenres (pgTAP, …_subgenres.sql): a fixed list of genres; a
-- track's subgenre is one of its genre's, built-in or the track owner's own,
-- never another user's or another genre's (23503, like a missing id); a
-- custom subgenre is coherent with its genre (23514).
-- Run with:  make db-test   (or: pnpm test:db)
-- Everything runs in a transaction that is rolled back: the DB stays clean.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;

select plan(22);

-- -----------------------------------------------------------------------------
-- Fixtures (inserted as superuser, so RLS does not apply)
--   user A: a custom subgenre "Mountain Doom" under Metal, an unlisted track in it
--   user B: a track without a genre
-- -----------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local');

insert into public.subgenres (id, user_id, genre_id, name) values
  ('ea111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   (select id from public.genres where name = 'Metal'), 'Mountain Doom');

insert into public.tracks (id, user_id, title, audio_path, mime_type, size_bytes, visibility, genre_id, subgenre_id) values
  ('a1111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Track A',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/a1111111-1111-4111-8111-111111111111.mp3', 'audio/mpeg', 1, 'unlisted',
   (select id from public.genres where name = 'Metal'), 'ea111111-1111-4111-8111-111111111111'),
  ('b1111111-1111-4111-8111-111111111111', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Track B',
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/b1111111-1111-4111-8111-111111111111.mp3', 'audio/mpeg', 1, 'private',
   null, null);

-- -----------------------------------------------------------------------------
-- The lists
-- -----------------------------------------------------------------------------
select is((select count(*)::int from public.genres), 19, 'the 19 main genres');

select throws_ok(
  $$ insert into public.subgenres (genre_id, name) values ((select id from public.genres where name = 'Pop'), 'thrash metal') $$,
  '23505', null,
  'built-in subgenre names are unique across genres: a name says which genre it is in'
);

select ok(
  not has_function_privilege('authenticated', 'private.check_track_genre()', 'execute')
    and not has_function_privilege('anon', 'private.check_track_genre()', 'execute')
    and not has_function_privilege('authenticated', 'private.check_subgenre_name()', 'execute')
    and not has_function_privilege('anon', 'private.check_subgenre_name()', 'execute'),
  'the checks are fired by their triggers only, never called'
);

select table_privs_are('public', 'subgenres', 'anon', array['SELECT'],
  'anonymous visitors can only read subgenres');

-- -----------------------------------------------------------------------------
-- User B: a track's subgenre
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "role": "authenticated"}', true);

select throws_ok(
  $$ update public.tracks
     set genre_id = (select id from public.genres where name = 'Metal'), subgenre_id = 'ea111111-1111-4111-8111-111111111111'
     where id = 'b1111111-1111-4111-8111-111111111111' $$,
  '23503', 'subgenre not found',
  'B cannot put own track in A''s custom subgenre'
);
select throws_ok(
  $$ update public.tracks
     set genre_id = (select id from public.genres where name = 'Rock'),
         subgenre_id = (select id from public.subgenres where name = 'Thrash Metal')
     where id = 'b1111111-1111-4111-8111-111111111111' $$,
  '23503', 'subgenre not found',
  'nor use a subgenre of another genre'
);
select throws_ok(
  $$ update public.tracks set subgenre_id = (select id from public.subgenres where name = 'Thrash Metal')
     where id = 'b1111111-1111-4111-8111-111111111111' $$,
  '23503', 'subgenre not found',
  'nor a subgenre without a genre'
);
select lives_ok(
  $$ update public.tracks
     set genre_id = (select id from public.genres where name = 'Metal'),
         subgenre_id = (select id from public.subgenres where name = 'Thrash Metal')
     where id = 'b1111111-1111-4111-8111-111111111111' $$,
  'B can use a built-in subgenre of the track''s genre'
);
select throws_ok(
  $$ update public.tracks set genre_id = (select id from public.genres where name = 'Rock')
     where id = 'b1111111-1111-4111-8111-111111111111' $$,
  '23503', 'subgenre not found',
  'a new genre cannot keep the old genre''s subgenre'
);

-- -----------------------------------------------------------------------------
-- User B: custom subgenres, coherent with their genre
-- -----------------------------------------------------------------------------
select lives_ok(
  $$ insert into public.subgenres (id, user_id, genre_id, name) values
       ('eb111111-1111-4111-8111-111111111111', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        (select id from public.genres where name = 'Metal'), 'Bog Metal') $$,
  'B creates a custom subgenre'
);
select lives_ok(
  $$ insert into public.subgenres (user_id, genre_id, name) values
       ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', (select id from public.genres where name = 'Metal'), 'Mountain Doom') $$,
  'the same name as another user''s is fine: each sees their own'
);
select throws_ok(
  $$ insert into public.subgenres (user_id, genre_id, name) values
       ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', (select id from public.genres where name = 'Metal'), ' jazz ') $$,
  '23514', 'jazz is a genre, not a subgenre',
  'a custom subgenre cannot be named like a genre'
);
select throws_ok(
  $$ insert into public.subgenres (user_id, genre_id, name) values
       ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', (select id from public.genres where name = 'Pop'), 'Thrash Metal') $$,
  '23514', 'Thrash Metal belongs to Metal',
  'nor like a built-in subgenre of another genre'
);
select throws_ok(
  $$ insert into public.subgenres (user_id, genre_id, name) values
       ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', (select id from public.genres where name = 'Metal'), 'thrash metal') $$,
  '23514', 'thrash metal belongs to Metal',
  'nor like a built-in subgenre of its own genre'
);
select throws_ok(
  $$ update public.subgenres set name = 'Black Metal' where id = 'eb111111-1111-4111-8111-111111111111' $$,
  '23514', 'Black Metal belongs to Metal',
  'a rename is checked too'
);
select lives_ok(
  $$ update public.subgenres set name = 'Swamp Metal' where id = 'eb111111-1111-4111-8111-111111111111' $$,
  'B renames own subgenre'
);
select throws_ok(
  $$ update public.subgenres set genre_id = (select id from public.genres where name = 'Pop')
     where id = 'eb111111-1111-4111-8111-111111111111' $$,
  '42501', null,
  'a subgenre cannot move to another genre (its tracks would be left in the wrong one)'
);
select throws_ok(
  $$ insert into public.subgenres (genre_id, name) values ((select id from public.genres where name = 'Metal'), 'Global subgenre') $$,
  '42501', null,
  'users cannot create built-in subgenres'
);
select is_empty(
  $$ select 1 from public.subgenres where id = 'ea111111-1111-4111-8111-111111111111' $$,
  'B cannot see A''s custom subgenres'
);

-- -----------------------------------------------------------------------------
-- User A: own subgenre, and its deletion
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "role": "authenticated"}', true);

select is(
  (select genre from public.get_shared_track('a1111111-1111-4111-8111-111111111111')),
  'Mountain Doom',
  'a shared track names its subgenre, the most specific'
);
select lives_ok(
  $$ update public.tracks set title = 'Track A, renamed' where id = 'a1111111-1111-4111-8111-111111111111' $$,
  'an edit that leaves the genre alone is not checked again'
);
-- Deleting a subgenre sets its tracks' subgenre to null and keeps their genre.
delete from public.subgenres where id = 'ea111111-1111-4111-8111-111111111111';
select is(
  (select genre from public.get_shared_track('a1111111-1111-4111-8111-111111111111')),
  'Metal',
  'deleting a subgenre clears it from its tracks, which keep their genre (now the name shared)'
);

select * from finish();
rollback;
