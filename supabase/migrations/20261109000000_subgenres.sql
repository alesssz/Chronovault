-- =============================================================================
-- Chronovault — a fixed list of genres, and subgenres under them
--
-- Before: the built-in genres plus any genre a user typed in, so one style
-- (metal) grew a custom genre per subgenre. Now:
--
-- 1. genres: the fixed list of 19 main genres, built-in only. Nobody adds,
--    renames or deletes one (no write grants, no write policies), and the
--    `user_id` column goes. Every custom genre is deleted (their tracks are
--    left without a genre: the owner starts again from the list). Built-in
--    genres that are no longer main genres become subgenres, and their
--    tracks move with them (Techno → Electronic › Techno…).
--
-- 2. subgenres (new): each under one genre. Built-in ones (`user_id` null)
--    come with the app, their names unique across the whole list, so a file
--    tag such as "Thrash Metal" names one genre. A user may add their own
--    under a genre, if coherent with it (private.check_subgenre_name): not
--    the name of a main genre, nor of a built-in subgenre (of another genre:
--    "Thrash Metal" under Pop; of the same one: it already exists).
--
-- 3. tracks.subgenre_id: optional, and only one of the track's genre, built-in
--    or the track owner's own (private.check_track_genre, rewritten). Any
--    other id answers like a missing one (23503, the API's 400).
--
-- 4. The share pages' functions name the most specific of the two: the
--    subgenre when set, else the genre (same signatures: `create or replace`).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. genres: built-in only.
-- -----------------------------------------------------------------------------

-- Rewritten below for subgenres; dropped first so the remapping is not checked
-- against a function that reads `genres.user_id`.
drop trigger tracks_check_genre on public.tracks;

-- Custom genres go; their tracks' genre_id becomes null (the foreign key).
delete from public.genres where user_id is not null;

-- Built-in rows only from now on: read by everyone, written by migrations only.
drop policy "genres: read built-in and own" on public.genres;
drop policy "genres: insert own" on public.genres;
drop policy "genres: update own" on public.genres;
drop policy "genres: delete own" on public.genres;
revoke insert, update, delete on table public.genres from authenticated;

create policy "genres: read"
  on public.genres for select
  to anon, authenticated
  using (true);

-- The owner's column and what used it: the per-owner unique names, the lookup index.
drop index public.genres_owner_name_key;
drop index public.genres_user_id_idx;
alter table public.genres drop column user_id;

-- Genre names are unique (ignoring case and spaces).
create unique index genres_name_key on public.genres (lower(btrim(name)));

-- The main genres that did not exist yet (the others keep their ids).
insert into public.genres (name) values
  ('Experimental'), ('Funk & Disco'), ('Gospel & Religious'), ('New Age'), ('Other'), ('R&B & Soul');

-- -----------------------------------------------------------------------------
-- 2. subgenres
-- -----------------------------------------------------------------------------
create table public.subgenres (
  id          uuid primary key default gen_random_uuid(),
  genre_id    uuid not null references public.genres (id) on delete cascade,
  -- NULL = built-in (visible to everyone); set = a custom subgenre of that user.
  user_id     uuid references auth.users (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  created_at  timestamptz not null default now()
);

-- Built-in names are unique across the whole list: a name says which genre it is in.
create unique index subgenres_builtin_name_key
  on public.subgenres (lower(btrim(name))) where user_id is null;
-- A user's own names are unique within a genre.
create unique index subgenres_own_name_key
  on public.subgenres (user_id, genre_id, lower(btrim(name))) where user_id is not null;
-- The genre's subgenres (the editor's list; the foreign key's cascade).
create index subgenres_genre_id_idx on public.subgenres (genre_id);
-- The user's own (the foreign key's cascade when an account is deleted).
create index subgenres_user_id_idx on public.subgenres (user_id) where user_id is not null;

-- A custom subgenre is coherent with its genre: its name is not a main genre's,
-- nor a built-in subgenre's. Built-in rows (migrations) are not checked.
-- Security invoker: genres and built-in subgenres are readable by every role.
create function private.check_subgenre_name()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  -- The built-in subgenre with the same name, if any, and its genre's name.
  v_genre text;
begin
  if new.user_id is null then
    return new;
  end if;

  if exists (select 1 from public.genres g where lower(btrim(g.name)) = lower(btrim(new.name))) then
    raise exception '% is a genre, not a subgenre', btrim(new.name) using errcode = '23514';
  end if;

  select g.name into v_genre
  from public.subgenres s
  join public.genres g on g.id = s.genre_id
  where s.user_id is null and lower(btrim(s.name)) = lower(btrim(new.name));

  if v_genre is not null then
    raise exception '% belongs to %', btrim(new.name), v_genre using errcode = '23514';
  end if;

  return new;
end;
$$;

-- Fired by its trigger only, never called: no role gets `execute`.
revoke all on function private.check_subgenre_name() from public, anon, authenticated;

create trigger subgenres_check_name
  before insert or update of name, genre_id, user_id on public.subgenres
  for each row execute function private.check_subgenre_name();

alter table public.subgenres enable row level security;

create policy "subgenres: read built-in and own"
  on public.subgenres for select
  to anon, authenticated
  using (user_id is null or user_id = (select auth.uid()));

create policy "subgenres: insert own"
  on public.subgenres for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "subgenres: update own"
  on public.subgenres for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "subgenres: delete own"
  on public.subgenres for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- Read: built-in subgenres are visible to everyone (RLS filters the rest).
-- Write: signed-in users, their own rows. Only the name can change: a subgenre
-- moved to another genre would leave its tracks in a genre it is not part of.
revoke all on table public.subgenres from anon, authenticated;
grant select on table public.subgenres to anon, authenticated;
grant insert, delete on table public.subgenres to authenticated;
grant update (name) on table public.subgenres to authenticated;

-- The built-in subgenres, by genre.
insert into public.subgenres (genre_id, name)
select g.id, sub.name
from (values
  ('Blues', array[
    'Acoustic Blues', 'Boogie-Woogie', 'British Blues', 'Chicago Blues', 'Country Blues',
    'Delta Blues', 'Electric Blues', 'Hill Country Blues', 'Jump Blues', 'Louisiana Blues',
    'Memphis Blues', 'Modern Blues', 'Piedmont Blues', 'Soul Blues', 'Swamp Blues', 'Texas Blues'
  ]),
  ('Country', array[
    'Alt-Country', 'Americana', 'Bakersfield Sound', 'Bluegrass', 'Bro-Country', 'Country Pop',
    'Country Rap', 'Country Rock', 'Cowpunk', 'Gothic Country', 'Honky Tonk', 'Nashville Sound',
    'Neotraditional Country', 'Outlaw Country', 'Progressive Bluegrass', 'Red Dirt', 'Texas Country',
    'Traditional Country', 'Western Swing'
  ]),
  ('Electronic', array[
    'Acid House', 'Afro House', 'Amapiano', 'Ambient', 'Bass House', 'Big Beat', 'Breakbeat',
    'Breakcore', 'Chillout', 'Chillwave', 'Chiptune', 'Dark Ambient', 'Deep House', 'Downtempo',
    'Drum & Bass', 'Dub Techno', 'Dubstep', 'EBM', 'EDM', 'EDM Trap', 'Electro', 'Electro House',
    'Electro Swing', 'Electroclash', 'Electronica', 'Eurodance', 'Footwork', 'French House',
    'Future Bass', 'Future Garage', 'Gabber', 'Glitch', 'Happy Hardcore', 'Hardstyle', 'House',
    'IDM', 'Jersey Club', 'Jungle', 'Lo-fi House', 'Melodic Techno', 'Minimal Techno', 'Moombahton',
    'Progressive House', 'Psytrance', 'Synthwave', 'Tech House', 'Techno', 'Trance', 'Trip Hop',
    'UK Garage', 'Vaporwave', 'Witch House'
  ]),
  ('Experimental', array[
    'Avant-Garde', 'Drone', 'Electroacoustic', 'Field Recordings', 'Free Improvisation',
    'Industrial', 'Lowercase', 'Musique Concrète', 'Noise', 'Plunderphonics', 'Power Electronics',
    'Sound Art', 'Sound Collage', 'Tape Music'
  ]),
  ('Folk', array[
    'Anti-Folk', 'Appalachian Folk', 'Balkan Folk', 'Celtic', 'Chamber Folk', 'Contemporary Folk',
    'Fado', 'Folk Pop', 'Freak Folk', 'Indie Folk', 'Irish Folk', 'Klezmer', 'Neofolk',
    'Nordic Folk', 'Polka', 'Psychedelic Folk', 'Rebetiko', 'Sea Shanties', 'Singer-Songwriter',
    'Traditional Folk'
  ]),
  ('Funk & Disco', array[
    'Afrobeat', 'Boogie', 'Disco', 'Electro-Funk', 'Euro Disco', 'Funk', 'Go-Go', 'Hi-NRG',
    'Italo Disco', 'Minneapolis Sound', 'Nu-Disco', 'P-Funk', 'Space Disco', 'Synth-Funk'
  ]),
  ('Gospel & Religious', array[
    'Black Gospel', 'Contemporary Christian', 'Devotional', 'Gregorian Chant', 'Hymns', 'Qawwali',
    'Southern Gospel', 'Spirituals', 'Worship'
  ]),
  ('Hip-Hop', array[
    'Abstract Hip-Hop', 'Alternative Hip-Hop', 'Boom Bap', 'Bounce', 'Christian Hip-Hop',
    'Cloud Rap', 'Conscious Hip-Hop', 'Crunk', 'Drill', 'East Coast Hip-Hop', 'Emo Rap', 'G-Funk',
    'Gangsta Rap', 'Grime', 'Hardcore Hip-Hop', 'Horrorcore', 'Instrumental Hip-Hop', 'Jazz Rap',
    'Lo-fi Hip-Hop', 'Memphis Rap', 'Old School Hip-Hop', 'Phonk', 'Pop Rap', 'Rage',
    'Southern Hip-Hop', 'Trap', 'Turntablism', 'UK Drill', 'West Coast Hip-Hop'
  ]),
  ('Jazz', array[
    'Acid Jazz', 'Avant-Garde Jazz', 'Bebop', 'Big Band', 'Contemporary Jazz', 'Cool Jazz',
    'Dixieland', 'Ethio-Jazz', 'Free Jazz', 'Gypsy Jazz', 'Hard Bop', 'Jazz Fusion', 'Jazz-Funk',
    'Latin Jazz', 'Modal Jazz', 'Nu Jazz', 'Post-Bop', 'Ragtime', 'Smooth Jazz', 'Soul Jazz',
    'Spiritual Jazz', 'Swing', 'Third Stream', 'Vocal Jazz'
  ]),
  ('Latin', array[
    'Bachata', 'Baile Funk', 'Banda', 'Bolero', 'Bossa Nova', 'Cha-Cha-Chá', 'Corridos', 'Cumbia',
    'Dembow', 'Flamenco', 'Forró', 'Latin Pop', 'Latin Rock', 'Latin Trap', 'Mambo', 'Mariachi',
    'Merengue', 'MPB', 'Norteño', 'Nueva Canción', 'Reggaeton', 'Salsa', 'Samba', 'Son Cubano',
    'Tango', 'Tejano', 'Tropicália', 'Vallenato'
  ]),
  ('Metal', array[
    'Alternative Metal', 'Black Metal', 'Blackgaze', 'Christian Metal', 'Death Metal', 'Deathcore',
    'Djent', 'Doom Metal', 'Folk Metal', 'Glam Metal', 'Gothic Metal', 'Grindcore', 'Groove Metal',
    'Heavy Metal', 'Industrial Metal', 'Melodic Death Metal', 'Metalcore', 'NWOBHM', 'Nu Metal',
    'Post-Metal', 'Power Metal', 'Progressive Metal', 'Sludge Metal', 'Speed Metal', 'Stoner Metal',
    'Symphonic Metal', 'Thrash Metal', 'Viking Metal'
  ]),
  ('New Age', array[
    'Binaural Beats', 'Celtic New Age', 'Contemporary Instrumental', 'Healing Music', 'Meditation',
    'Nature Sounds', 'Relaxation', 'Space Music'
  ]),
  ('Other', array[
    'A Cappella', 'Baroque', 'Barbershop', 'Bhangra', 'Calypso', 'Chamber Music',
    'Children''s Music', 'Chinese Traditional', 'Choral', 'Christmas', 'Classical', 'Comedy',
    'Contemporary Classical', 'Easy Listening', 'Enka', 'Exotica', 'Gamelan', 'Gnawa', 'Highlife',
    'Indian Classical', 'Lounge', 'Lullabies', 'Maqam', 'Marching Band', 'Mbalax',
    'Medieval & Renaissance', 'Minimalism', 'Neoclassical', 'Opera', 'Rai', 'Romantic Era', 'Soca',
    'Soukous', 'Spoken Word', 'Throat Singing'
  ]),
  ('Pop', array[
    'Adult Contemporary', 'Afrobeats', 'Art Pop', 'Baroque Pop', 'Bedroom Pop', 'Bubblegum Pop',
    'C-Pop', 'Chamber Pop', 'Chanson', 'City Pop', 'Dance-Pop', 'Dream Pop', 'Electropop', 'Europop',
    'Hyperpop', 'Indie Pop', 'J-Pop', 'K-Pop', 'Schlager', 'Sophisti-Pop', 'Sunshine Pop',
    'Synth-Pop', 'Teen Pop', 'Traditional Pop'
  ]),
  ('Punk', array[
    'Anarcho-Punk', 'Art Punk', 'Crust Punk', 'Dance-Punk', 'Emo', 'Folk Punk', 'Garage Punk',
    'Hardcore Punk', 'Horror Punk', 'Melodic Hardcore', 'Midwest Emo', 'Oi!', 'Pop Punk',
    'Post-Hardcore', 'Post-Punk', 'Powerviolence', 'Proto-Punk', 'Psychobilly', 'Riot Grrrl',
    'Screamo', 'Ska Punk', 'Skate Punk', 'Street Punk', 'Synth-Punk'
  ]),
  ('R&B & Soul', array[
    'Alternative R&B', 'Blue-Eyed Soul', 'Contemporary R&B', 'Doo-Wop', 'Motown', 'Neo Soul',
    'New Jack Swing', 'Northern Soul', 'Philly Soul', 'Psychedelic Soul', 'Quiet Storm',
    'Rhythm and Blues', 'Soul', 'Southern Soul'
  ]),
  ('Reggae', array[
    'Dancehall', 'Dub', 'Dub Poetry', 'Lovers Rock', 'Mento', 'Ragga', 'Reggae Fusion', 'Rocksteady',
    'Roots Reggae', 'Ska', 'Two-Tone'
  ]),
  ('Rock', array[
    'Acid Rock', 'Alternative Rock', 'Arena Rock', 'Art Rock', 'Blues Rock', 'Britpop',
    'Christian Rock', 'Classic Rock', 'Darkwave', 'Folk Rock', 'Funk Rock', 'Garage Rock',
    'Glam Rock', 'Gothic Rock', 'Grunge', 'Hard Rock', 'Heartland Rock', 'Indie Rock', 'Krautrock',
    'Math Rock', 'New Wave', 'Noise Rock', 'Pop Rock', 'Post-Grunge', 'Post-Rock', 'Power Pop',
    'Progressive Rock', 'Psychedelic Rock', 'Rap Rock', 'Rock and Roll', 'Rockabilly', 'Shoegaze',
    'Slowcore', 'Soft Rock', 'Southern Rock', 'Space Rock', 'Stoner Rock', 'Surf Rock',
    'Symphonic Rock', 'Yacht Rock'
  ]),
  ('Soundtrack', array[
    'Anime', 'Bollywood', 'Cinematic', 'Film Score', 'Library Music', 'Musical Theatre',
    'Trailer Music', 'TV Soundtrack', 'Video Game Music'
  ])
) as list (genre, names)
join public.genres g on g.name = list.genre
cross join lateral unnest(list.names) as sub (name);

-- -----------------------------------------------------------------------------
-- 3. tracks.subgenre_id, and the remapping of the old built-in genres.
-- -----------------------------------------------------------------------------
alter table public.tracks
  add column subgenre_id uuid references public.subgenres (id) on delete set null;

create index tracks_subgenre_idx on public.tracks (subgenre_id);

-- Tracks on a built-in genre that is now a subgenre (or merged into a main
-- genre) move to it. `updated_at` is left alone: the tracks did not change
-- for their owners, and it versions their cover addresses.
alter table public.tracks disable trigger tracks_set_updated_at;

update public.tracks t
set genre_id = g.id, subgenre_id = s.id
from (values
  ('Ambient',           'Electronic',   'Ambient'),
  ('Drum & Bass',       'Electronic',   'Drum & Bass'),
  ('House',             'Electronic',   'House'),
  ('Techno',            'Electronic',   'Techno'),
  ('Dance',             'Electronic',   null),
  ('Trap',              'Hip-Hop',      'Trap'),
  ('Lo-fi',             'Hip-Hop',      'Lo-fi Hip-Hop'),
  ('Indie',             'Rock',         'Indie Rock'),
  ('Singer-songwriter', 'Folk',         'Singer-Songwriter'),
  ('Soul',              'R&B & Soul',   'Soul'),
  ('R&B',               'R&B & Soul',   null),
  ('Funk',              'Funk & Disco', 'Funk'),
  ('Classical',         'Other',        'Classical')
) as remap (old_name, genre_name, subgenre_name)
join public.genres old on old.name = remap.old_name
join public.genres g on g.name = remap.genre_name
left join public.subgenres s on s.user_id is null and s.name = remap.subgenre_name
where t.genre_id = old.id;

alter table public.tracks enable trigger tracks_set_updated_at;

-- The old built-in genres that are no longer main genres (no track uses them now).
delete from public.genres
where name in ('Ambient', 'Classical', 'Dance', 'Drum & Bass', 'Funk', 'House', 'Indie',
               'Lo-fi', 'R&B', 'Singer-songwriter', 'Soul', 'Techno', 'Trap');

-- A track's subgenre is one of its genre's, built-in or the track owner's own.
-- The genre itself needs no check any more: every genre is built-in (the
-- foreign key is enough). Same name as the function it replaces (…_track_genre_and_lock_order.sql).
create or replace function private.check_track_genre()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.subgenre_id is not null and not exists (
    select 1 from public.subgenres s
    where s.id = new.subgenre_id
      and s.genre_id is not distinct from new.genre_id
      and (s.user_id is null or s.user_id = new.user_id)
  ) then
    -- Someone else's subgenre, or one of another genre, answers like a missing one.
    raise exception 'subgenre not found' using errcode = '23503';
  end if;
  return new;
end;
$$;

-- On a new track and on a change of genre or subgenre (a subgenre deleted
-- sets it to null, which passes; other edits leave them alone).
create trigger tracks_check_genre
  before insert or update of genre_id, subgenre_id on public.tracks
  for each row execute function private.check_track_genre();

-- -----------------------------------------------------------------------------
-- 4. Share pages: the most specific name (same bodies as in
--    …_track_status.sql and …_shared_track_downloads.sql, plus the subgenre).
-- -----------------------------------------------------------------------------
create or replace function public.get_shared_track(p_track_id uuid)
returns table (
  id               uuid,
  title            text,
  composers        text,
  album            text,
  year             smallint,
  genre            text,
  description      text,
  lyrics           text,
  lyrics_synced    jsonb,
  duration_seconds real,
  peaks            jsonb,
  cover_path       text,
  audio_path       text,
  visibility       public.track_visibility,
  status           public.track_status,
  updated_at       timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    t.id, t.title, t.composers, t.album, t.year, coalesce(s.name, g.name), t.description,
    t.lyrics, t.lyrics_synced, t.duration_seconds, t.peaks, t.cover_path,
    t.audio_path, t.visibility, t.status, t.updated_at
  from public.tracks t
  left join public.genres g on g.id = t.genre_id
  left join public.subgenres s on s.id = t.subgenre_id
  where t.id = p_track_id
    and t.visibility <> 'private';
$$;

create or replace function public.get_shared_playlist_tracks(p_playlist_id uuid)
returns table (
  "position"       integer,
  id               uuid,
  title            text,
  composers        text,
  album            text,
  year             smallint,
  genre            text,
  description      text,
  lyrics           text,
  lyrics_synced    jsonb,
  duration_seconds real,
  peaks            jsonb,
  cover_path       text,
  audio_path       text,
  visibility       public.track_visibility,
  status           public.track_status,
  updated_at       timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    pt.position, t.id, t.title, t.composers, t.album, t.year, coalesce(s.name, g.name), t.description,
    t.lyrics, t.lyrics_synced, t.duration_seconds, t.peaks, t.cover_path, t.audio_path,
    t.visibility, t.status, t.updated_at
  from public.playlists p
  join public.playlist_tracks pt on pt.playlist_id = p.id
  join public.tracks t on t.id = pt.track_id
  left join public.genres g on g.id = t.genre_id
  left join public.subgenres s on s.id = t.subgenre_id
  where p.id = p_playlist_id
    and p.visibility <> 'private'
  order by pt.position;
$$;
