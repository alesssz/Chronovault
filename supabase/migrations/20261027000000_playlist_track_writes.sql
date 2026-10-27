-- =============================================================================
-- Chronovault — a playlist's track list under writes that overlap
--
-- Two problems with requests that reach the database at the same moment
-- (two quick "Add to playlist", two tabs, two serverless instances):
--
-- - Appending was done by the app's server in two steps: read the list, then
--   write it back whole with set_playlist_tracks. Two appends both read
--   [A] and wrote [A,B] and [A,C]: one of the new tracks was silently lost.
--   append_playlist_tracks now does it in one step, in the database.
-- - set_playlist_tracks deletes the rows and inserts the new ones. Two calls
--   at once: the second's delete could not see the rows the first had just
--   inserted (not committed yet), so its insert hit the primary key and the
--   request failed (23505, answered 409) on a plain reorder.
--
-- Both functions now start by locking the playlist's row (`for update`):
-- writes to the same playlist run one after the other, each one seeing the
-- list the previous one left. Writes to different playlists never wait.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- set_playlist_tracks: as in …_private_helpers.sql, plus the lock.
-- `create or replace` keeps the function and its grants.
-- -----------------------------------------------------------------------------
create or replace function public.set_playlist_tracks(p_playlist_id uuid, p_track_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not private.owns_playlist(p_playlist_id) then
    raise exception 'playlist not found' using errcode = 'P0002';
  end if;

  -- One write to this playlist at a time, until commit (see the top of this file).
  perform 1 from public.playlists where id = p_playlist_id for update;

  delete from public.playlist_tracks where playlist_id = p_playlist_id;

  insert into public.playlist_tracks (playlist_id, track_id, position)
  select p_playlist_id, ids.track_id, (ids.ord - 1)::integer
  from unnest(p_track_ids) with ordinality as ids (track_id, ord);

  update public.playlists set updated_at = now() where id = p_playlist_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- append_playlist_tracks: adds tracks at the end of the list, in the given
-- order; tracks already in it (or given twice) are skipped, and the ones
-- there keep their place. Security invoker like set_playlist_tracks: RLS
-- applies, so only the owner's own tracks can be added (42501 otherwise).
-- At most 1000 tracks (MAX_PLAYLIST_TRACKS in shared/schemas/playlist.ts,
-- which the app checks first with a friendlier message): 23514 past it.
-- -----------------------------------------------------------------------------
create function public.append_playlist_tracks(p_playlist_id uuid, p_track_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  -- Position the first new track takes: after the last one there.
  v_next integer;
begin
  if not private.owns_playlist(p_playlist_id) then
    raise exception 'playlist not found' using errcode = 'P0002';
  end if;

  -- One write to this playlist at a time, until commit: the list read below
  -- is the one the previous write left.
  perform 1 from public.playlists where id = p_playlist_id for update;

  select coalesce(max(pt.position) + 1, 0) into v_next
  from public.playlist_tracks pt
  where pt.playlist_id = p_playlist_id;

  insert into public.playlist_tracks (playlist_id, track_id, position)
  select p_playlist_id, added.track_id, (v_next + row_number() over (order by added.ord) - 1)::integer
  from (
    -- Each given track once (its first place), and only the ones not in the list yet.
    select ids.track_id, min(ids.ord) as ord
    from unnest(p_track_ids) with ordinality as ids (track_id, ord)
    where not exists (
      select 1 from public.playlist_tracks pt
      where pt.playlist_id = p_playlist_id and pt.track_id = ids.track_id
    )
    group by ids.track_id
  ) as added;

  if (select count(*) from public.playlist_tracks pt where pt.playlist_id = p_playlist_id) > 1000 then
    raise exception 'a playlist holds at most 1000 tracks' using errcode = '23514';
  end if;

  update public.playlists set updated_at = now() where id = p_playlist_id;
end;
$$;

-- Signed-in users only, like set_playlist_tracks (an anonymous call could only fail).
revoke all on function public.append_playlist_tracks(uuid, uuid[]) from public, anon;
grant execute on function public.append_playlist_tracks(uuid, uuid[]) to authenticated;
