-- =============================================================================
-- ChronoPlayer — draft and final tracks
--
-- A track is a 'draft' (a work in progress: e.g. one of several Suno
-- versions sent to friends to choose from) or 'final' (the chosen version).
-- New uploads start as drafts; tracks that existed before this migration
-- are the user's finished library, so they become 'final'.
--
-- Shared pages show drafts as "Work in progress": the two sharing functions
-- now return the status too (it is not private, unlike the Suno prompt).
-- =============================================================================

create type public.track_status as enum ('draft', 'final');

-- The 'final' default fills the existing rows; then new rows default to 'draft'.
alter table public.tracks add column status public.track_status not null default 'final';
alter table public.tracks alter column status set default 'draft';

-- The library filters on it ("Final" / "Drafts").
create index tracks_user_status_idx on public.tracks (user_id, status);

-- -----------------------------------------------------------------------------
-- Sharing functions: same as before, plus `status`. A function's result type
-- cannot change in place, hence drop + create (and the grants again).
-- -----------------------------------------------------------------------------
drop function public.get_shared_track(uuid);

create function public.get_shared_track(p_track_id uuid)
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
    t.id, t.title, t.composers, t.album, t.year, g.name, t.description,
    t.lyrics, t.lyrics_synced, t.duration_seconds, t.peaks, t.cover_path,
    t.audio_path, t.visibility, t.status, t.updated_at
  from public.tracks t
  left join public.genres g on g.id = t.genre_id
  where t.id = p_track_id
    and t.visibility <> 'private';
$$;

revoke all on function public.get_shared_track(uuid) from public;
grant execute on function public.get_shared_track(uuid) to anon, authenticated;

drop function public.get_shared_playlist_tracks(uuid);

create function public.get_shared_playlist_tracks(p_playlist_id uuid)
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
  status           public.track_status,
  updated_at       timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    pt.position, t.id, t.title, t.composers, t.album, t.year, g.name, t.description,
    t.lyrics, t.lyrics_synced, t.duration_seconds, t.peaks, t.cover_path, t.audio_path,
    t.status, t.updated_at
  from public.playlists p
  join public.playlist_tracks pt on pt.playlist_id = p.id
  join public.tracks t on t.id = pt.track_id
  left join public.genres g on g.id = t.genre_id
  where p.id = p_playlist_id
    and p.visibility <> 'private'
  order by pt.position;
$$;

revoke all on function public.get_shared_playlist_tracks(uuid) from public;
grant execute on function public.get_shared_playlist_tracks(uuid) to anon, authenticated;
