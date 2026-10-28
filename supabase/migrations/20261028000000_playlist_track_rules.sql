-- =============================================================================
-- Chronovault — playlist entries: owner's tracks only, at most 1000, whatever
-- the way they are written
--
-- The app writes playlist entries only through set_playlist_tracks and
-- append_playlist_tracks, which check both rules. But signed-in users can
-- also reach the table directly through the Data API (PostgREST, with their
-- own token), and there two holes were left:
--
-- 1. UPDATE of an entry checked only that the playlist was the caller's, not
--    the track: the insert policy checks the track's owner, the update
--    policy did not. Someone with an account could take an entry of their
--    own playlist and point it at another user's track (its id is enough,
--    e.g. from a link that user once shared), then share the playlist: the
--    share page, built from the playlist's entries, gave away that track's
--    lyrics, audio and cover, even after its owner made it private again.
--    The app never updates an entry (a reorder rewrites the list), so the
--    privilege goes away entirely, with its policy: an UPDATE is now refused
--    (42501) before any row is read.
--
-- 2. The 1000-track limit (MAX_PLAYLIST_TRACKS in shared/schemas/playlist.ts)
--    was checked by append_playlist_tracks only: set_playlist_tracks with a
--    longer list, or rows inserted directly, went past it, and the share
--    page of such a playlist returns every track in one answer. The limit is
--    now a trigger on the table itself, checked after every insert statement
--    whoever runs it: 23514 (the API's 400) past it. append_playlist_tracks
--    loses its own check, now the same rule run twice.
--
-- The app's own writes are unchanged: the API validates the list first
-- (at most 1000 distinct ids) and answers with a friendlier message.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. No direct updates of playlist entries.
-- -----------------------------------------------------------------------------
drop policy "playlist tracks: update own" on public.playlist_tracks;
-- Select, insert and delete stay (…_playlists.sql): the functions above run
-- with the caller's rights and delete and insert entries, never update them.
revoke update on table public.playlist_tracks from authenticated;

-- -----------------------------------------------------------------------------
-- 2. At most 1000 entries per playlist, checked once per insert statement.
-- -----------------------------------------------------------------------------

-- The playlists an insert just added entries to, each checked against the
-- limit. Per statement, not per row: set_playlist_tracks writes a whole list
-- in one insert, and counting the playlist again for each of its rows would
-- cost a count per row. `new_entries` holds the rows the statement inserted.
--
-- Security invoker: it counts with the rights of whoever inserted, who can
-- see every entry of the playlists they may insert into (their own). A
-- concurrent writer can slip past by the size of one statement only when
-- it writes to the table directly: the two functions lock the playlist's
-- row first (…_playlist_track_writes.sql), so theirs never overlap.
create function private.enforce_playlist_size()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.playlist_tracks pt
    where pt.playlist_id in (select e.playlist_id from new_entries e)
    group by pt.playlist_id
    having count(*) > 1000
  ) then
    raise exception 'a playlist holds at most 1000 tracks' using errcode = '23514';
  end if;
  -- An AFTER … FOR EACH STATEMENT trigger's result is ignored.
  return null;
end;
$$;

-- Fired by its trigger only, never called: no role gets `execute`
-- (a trigger fires whatever the privileges of the user).
revoke all on function private.enforce_playlist_size() from public, anon, authenticated;

create trigger playlist_tracks_enforce_size
  after insert on public.playlist_tracks
  referencing new table as new_entries
  for each statement execute function private.enforce_playlist_size();

-- -----------------------------------------------------------------------------
-- append_playlist_tracks: the body of …_playlist_track_ownership.sql without
-- its own count, which the trigger above now does for every insert.
-- `create or replace` keeps the function and its grants.
-- -----------------------------------------------------------------------------
create or replace function public.append_playlist_tracks(p_playlist_id uuid, p_track_ids uuid[])
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
  -- Only the caller's own tracks: a missing one and someone else's alike are "not found".
  if exists (
    select 1 from unnest(p_track_ids) as ids (track_id)
    where not exists (
      select 1 from public.tracks t where t.id = ids.track_id and t.user_id = (select auth.uid())
    )
  ) then
    raise exception 'track not found' using errcode = 'P0002';
  end if;

  -- One write to this playlist at a time, until commit: the list read below
  -- is the one the previous write left.
  perform 1 from public.playlists where id = p_playlist_id for update;

  select coalesce(max(pt.position) + 1, 0) into v_next
  from public.playlist_tracks pt
  where pt.playlist_id = p_playlist_id;

  -- Past 1000 entries the insert fails (23514, the trigger above) and nothing is added.
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

  update public.playlists set updated_at = now() where id = p_playlist_id;
end;
$$;
