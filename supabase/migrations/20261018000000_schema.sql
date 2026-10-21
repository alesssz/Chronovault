-- =============================================================================
-- ChronoPlayer — base schema
-- Tables: genres, tracks. Files (audio, covers) live in Storage:
-- the database only stores their paths.
--
-- Later migrations: …_rls.sql (row level security), …_storage.sql (buckets and
-- storage policies), …_grants.sql (table privileges), …_public_sharing.sql
-- (link sharing), …_playlists.sql (playlists).
-- =============================================================================

create type public.track_visibility as enum ('private', 'unlisted', 'public');

-- -----------------------------------------------------------------------------
-- Genres: user_id NULL = built-in genre (visible to everyone),
--         user_id set   = custom genre owned by that user.
-- -----------------------------------------------------------------------------
create table public.genres (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  created_at  timestamptz not null default now()
);

-- Genre names are unique (case-insensitive) per user and among built-ins.
create unique index genres_owner_name_key
  on public.genres (coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(btrim(name)));

-- -----------------------------------------------------------------------------
-- Tracks
-- -----------------------------------------------------------------------------
create table public.tracks (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,

  -- editable metadata
  title             text not null check (char_length(btrim(title)) between 1 and 200),
  composers         text check (char_length(composers) <= 300),
  genre_id          uuid references public.genres (id) on delete set null,
  year              smallint check (year between 1000 and 9999),
  album             text check (char_length(album) <= 200),
  description       text check (char_length(description) <= 5000),
  suno_prompt       text check (char_length(suno_prompt) <= 5000),
  mastered          boolean not null default false,
  visibility        public.track_visibility not null default 'private',
  lyrics            text check (char_length(lyrics) <= 20000),
  -- [{ "time": 12.34, "text": "line" }, ...] sorted by time
  lyrics_synced     jsonb check (lyrics_synced is null or jsonb_typeof(lyrics_synced) = 'array'),
  -- computed flags: the library reads them without downloading the full lyrics
  has_lyrics        boolean generated always as (coalesce(btrim(lyrics), '') <> '') stored,
  has_synced_lyrics boolean generated always as (
                      jsonb_typeof(lyrics_synced) = 'array' and jsonb_array_length(lyrics_synced) > 0
                    ) stored,

  -- files and technical data
  audio_path        text not null unique,
  cover_path        text,
  mime_type         text not null,
  size_bytes        bigint not null check (size_bytes > 0),
  duration_seconds  real check (duration_seconds >= 0),
  -- normalized amplitudes 0..1 used to draw the waveform without decoding the file
  peaks             jsonb check (peaks is null or jsonb_typeof(peaks) = 'array'),

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- files must live in the owner's folder
  constraint tracks_audio_path_owner check (split_part(audio_path, '/', 1) = user_id::text),
  constraint tracks_cover_path_owner check (cover_path is null or split_part(cover_path, '/', 1) = user_id::text)
);

create index tracks_user_created_idx on public.tracks (user_id, created_at desc);
create index tracks_genre_idx on public.tracks (genre_id);
create index tracks_public_idx on public.tracks (created_at desc) where visibility = 'public';

-- -----------------------------------------------------------------------------
-- Automatic updated_at
-- -----------------------------------------------------------------------------
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger tracks_set_updated_at
  before update on public.tracks
  for each row execute function public.set_updated_at();

-- The owner of a track can never be changed.
create function public.prevent_owner_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'user_id cannot be changed';
  end if;
  return new;
end;
$$;

create trigger tracks_prevent_owner_change
  before update on public.tracks
  for each row execute function public.prevent_owner_change();

-- -----------------------------------------------------------------------------
-- Built-in genres
-- -----------------------------------------------------------------------------
insert into public.genres (name) values
  ('Ambient'), ('Blues'), ('Classical'), ('Country'), ('Dance'),
  ('Drum & Bass'), ('Electronic'), ('Folk'), ('Funk'), ('Hip-Hop'),
  ('House'), ('Indie'), ('Jazz'), ('Latin'), ('Lo-fi'),
  ('Metal'), ('Pop'), ('Punk'), ('R&B'), ('Reggae'),
  ('Rock'), ('Singer-songwriter'), ('Soul'), ('Soundtrack'), ('Techno'), ('Trap');
