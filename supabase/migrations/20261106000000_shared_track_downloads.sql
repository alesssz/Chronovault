-- =============================================================================
-- Chronovault — which shared tracks visitors may download
--
-- The share pages offer a track's file for download only when the track
-- itself is 'unlisted' or 'private' (a private one being reachable only
-- through a shared playlist); a 'public' track is never offered, on its own
-- page or inside a playlist. The rule is the track's, not the playlist's.
--
-- get_shared_track() already returns the track's visibility.
-- get_shared_playlist_tracks() did not ("visitors don't need it"): it now
-- returns it too, for the server to decide. The API still never sends the
-- visibility of a playlist's tracks, only the outcome (`downloadable`, see
-- server/mappers/track.ts).
--
-- Same function as in …_track_status.sql plus `visibility`. A function's
-- result type cannot change in place, hence drop + create (and the grants again).
-- =============================================================================

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
    pt.position, t.id, t.title, t.composers, t.album, t.year, g.name, t.description,
    t.lyrics, t.lyrics_synced, t.duration_seconds, t.peaks, t.cover_path, t.audio_path,
    t.visibility, t.status, t.updated_at
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
