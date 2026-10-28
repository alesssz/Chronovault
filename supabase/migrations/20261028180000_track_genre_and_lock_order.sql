-- =============================================================================
-- Chronovault — a track's genre is one its owner can see; playlist writes
-- lock their tracks before touching the list
--
-- 1. tracks.genre_id could name another user's custom genre. The tracks
--    policies check the row's owner only, and a foreign key does not look at
--    RLS: a signed-in user could set (through the API, or the Data API) the
--    id of someone else's private genre on their own track. The share pages
--    then showed that genre's name (get_shared_track and
--    get_shared_playlist_tracks read it as definer), it followed the other
--    user's renames, and the answer told an id that exists (200) from one
--    that does not (400). The playlist_tracks update policy had the same
--    gap (…_playlist_track_rules.sql). A trigger now accepts a built-in
--    genre or one of the track owner's own, and answers any other id like a
--    missing one: 23503, the API's 400 "Invalid reference".
--
-- 2. set_playlist_tracks deleted the list's entries, then inserted them
--    again, each insert taking a key-share lock on its track (the foreign
--    key). Deleting one of those tracks at the same moment (another tab)
--    locks the track first, then its entries (the cascade): opposite orders,
--    a deadlock (40P01, a 500), or, when the deletion came first, the
--    re-insert failing on the gone track (23503, a 400 for a plain reorder).
--    append_playlist_tracks could deadlock the same way with its inserts.
--    Both now lock the tracks they will hold (`for key share`, which a
--    deletion waits for) before writing anything, and count them at once:
--    a track deleted meanwhile is simply "not found" (P0002, 404). The
--    count replaces the ownership check done before the playlist's lock,
--    which a deletion could make stale.
--
-- `create or replace` keeps each function and its grants.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. A track's genre: built-in, or its owner's own.
-- -----------------------------------------------------------------------------

-- Security invoker: the explicit rule below decides, not what the caller may
-- read (the genres policies agree with it for signed-in users anyway).
create function private.check_track_genre()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.genre_id is not null and not exists (
    select 1 from public.genres g
    where g.id = new.genre_id and (g.user_id is null or g.user_id = new.user_id)
  ) then
    -- Someone else's genre answers like a missing one: no id's existence is told.
    raise exception 'genre not found' using errcode = '23503';
  end if;
  return new;
end;
$$;

-- Fired by its trigger only, never called: no role gets `execute`.
revoke all on function private.check_track_genre() from public, anon, authenticated;

-- On a new track and on a change of genre only (a genre deleted sets it to
-- null, which passes; other edits leave an existing genre alone).
create trigger tracks_check_genre
  before insert or update of genre_id on public.tracks
  for each row execute function private.check_track_genre();

-- -----------------------------------------------------------------------------
-- 2. set_playlist_tracks: the body of …_playlist_track_ownership.sql, its
--    tracks locked and counted once the playlist is.
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

  -- One write to this playlist at a time, until commit (…_playlist_track_writes.sql).
  perform 1 from public.playlists where id = p_playlist_id for update;

  -- The tracks the list will hold, the caller's own only, locked so none can be deleted
  -- until commit; any missing, someone else's or deleted meanwhile is "not found".
  if (
    select count(*) from (
      select 1 from public.tracks t
      where t.id = any (p_track_ids) and t.user_id = (select auth.uid())
      for key share
    ) as locked
  ) <> (select count(distinct ids.track_id) from unnest(p_track_ids) as ids (track_id)) then
    raise exception 'track not found' using errcode = 'P0002';
  end if;

  delete from public.playlist_tracks where playlist_id = p_playlist_id;

  insert into public.playlist_tracks (playlist_id, track_id, position)
  select p_playlist_id, ids.track_id, (ids.ord - 1)::integer
  from unnest(p_track_ids) with ordinality as ids (track_id, ord);

  update public.playlists set updated_at = now() where id = p_playlist_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- append_playlist_tracks: the body of …_playlist_track_rules.sql, with the
-- same lock and count in place of the check made before the playlist's lock.
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

  -- One write to this playlist at a time, until commit: the list read below
  -- is the one the previous write left.
  perform 1 from public.playlists where id = p_playlist_id for update;

  -- The tracks to add, the caller's own only, locked so none can be deleted until
  -- commit (given twice, counted once); any missing, someone else's or deleted
  -- meanwhile is "not found".
  if (
    select count(*) from (
      select 1 from public.tracks t
      where t.id = any (p_track_ids) and t.user_id = (select auth.uid())
      for key share
    ) as locked
  ) <> (select count(distinct ids.track_id) from unnest(p_track_ids) as ids (track_id)) then
    raise exception 'track not found' using errcode = 'P0002';
  end if;

  select coalesce(max(pt.position) + 1, 0) into v_next
  from public.playlist_tracks pt
  where pt.playlist_id = p_playlist_id;

  -- Past 1000 entries the insert fails (23514, the size trigger) and nothing is added.
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
