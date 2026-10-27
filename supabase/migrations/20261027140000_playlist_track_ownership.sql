-- =============================================================================
-- Chronovault — a playlist takes only its owner's tracks: 404 otherwise
--
-- Adding to a playlist a track that does not exist, or someone else's, was
-- refused by the playlist_tracks policy as the row went in: 42501, which the
-- API answers 403 ("Operation not allowed"). Everywhere else the API answers
-- 404 for an item that is missing, private or someone else's, without telling
-- which (docs/09-api-reference.md). Both functions now check the track ids
-- first, before writing anything, and raise P0002 (404) for any id that is
-- not one of the caller's own tracks. The policy stays as the last line of
-- defense, and direct writes to the table still meet it.
--
-- `create or replace` keeps each function and its grants; the bodies are those
-- of …_playlist_track_writes.sql (the playlist's row locked first) plus the check.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- set_playlist_tracks: replaces the list, in the given order.
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
  -- Only the caller's own tracks: a missing one and someone else's alike are "not found".
  if exists (
    select 1 from unnest(p_track_ids) as ids (track_id)
    where not exists (
      select 1 from public.tracks t where t.id = ids.track_id and t.user_id = (select auth.uid())
    )
  ) then
    raise exception 'track not found' using errcode = 'P0002';
  end if;

  -- One write to this playlist at a time, until commit (…_playlist_track_writes.sql).
  perform 1 from public.playlists where id = p_playlist_id for update;

  delete from public.playlist_tracks where playlist_id = p_playlist_id;

  insert into public.playlist_tracks (playlist_id, track_id, position)
  select p_playlist_id, ids.track_id, (ids.ord - 1)::integer
  from unnest(p_track_ids) with ordinality as ids (track_id, ord);

  update public.playlists set updated_at = now() where id = p_playlist_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- append_playlist_tracks: adds tracks at the end, in order, each once.
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
