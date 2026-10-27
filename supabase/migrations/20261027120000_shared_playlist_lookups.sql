-- =============================================================================
-- Chronovault — small lookups for a shared playlist's player and cover
--
-- Two public routes needed one value from a shared playlist and read the
-- whole of it through get_shared_playlist_tracks: every track with its
-- lyrics (up to 20k characters), synced lyrics (up to 2000 lines) and 1000
-- waveform peaks, for up to 1000 tracks. Several MB to throw away, on every
-- change of track in the share page's player, and for anyone with the link:
--
--   GET /api/shared/playlists/:id/tracks/:trackId/playback   one audio path
--   GET /api/shared/playlists/:id/cover                       one cover path
--
-- Each now has a function returning that one path, under the same rule as
-- get_shared_playlist_tracks: only a non-private playlist, and only a track
-- in it (private tracks included: sharing a playlist shares its tracks).
-- Security definer like the other get_shared_* functions (they bypass RLS,
-- so the visibility filter is here), with an empty search_path.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- The audio file of one track of a shared playlist; null when the playlist is
-- private or missing, or the track is not in it.
-- -----------------------------------------------------------------------------
create function public.get_shared_playlist_track_audio(p_playlist_id uuid, p_track_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select t.audio_path
  from public.playlists p
  join public.playlist_tracks pt on pt.playlist_id = p.id
  join public.tracks t on t.id = pt.track_id
  where p.id = p_playlist_id
    and pt.track_id = p_track_id
    and p.visibility <> 'private';
$$;

-- -----------------------------------------------------------------------------
-- The cover a shared playlist shows: its own, otherwise the first track's that
-- has one, in playlist order (the first tile of the mosaic, mappers/playlist.ts).
-- Null when the playlist is private or missing, or no cover exists.
-- -----------------------------------------------------------------------------
create function public.get_shared_playlist_cover(p_playlist_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    p.cover_path,
    (select t.cover_path
     from public.playlist_tracks pt
     join public.tracks t on t.id = pt.track_id
     where pt.playlist_id = p.id and t.cover_path is not null
     order by pt.position
     limit 1)
  )
  from public.playlists p
  where p.id = p_playlist_id
    and p.visibility <> 'private';
$$;

-- For the share pages: anyone, signed in or not (like get_shared_playlist_tracks).
revoke all on function public.get_shared_playlist_track_audio(uuid, uuid) from public;
revoke all on function public.get_shared_playlist_cover(uuid) from public;
grant execute on function public.get_shared_playlist_track_audio(uuid, uuid) to anon, authenticated;
grant execute on function public.get_shared_playlist_cover(uuid) to anon, authenticated;
