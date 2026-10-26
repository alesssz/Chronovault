-- =============================================================================
-- Chronovault — caps on what anonymous visitors can write
--
-- Plays and votes need no account: a visitor is a random browser id
-- (app/lib/listener-id.ts) that the server cannot check, so a script making
-- up a new id for every request counted as a new listener or voter each
-- time, without end: made-up statistics, a group of versions flooded with
-- votes and comments, and tables growing until the Free plan's 500 MB are
-- full (then every write of the app fails, not just these).
--
-- The caps live here, in the functions, because anon may call them straight
-- through the Data API (`/rest/v1/rpc/…`, with the public key every browser
-- has), skipping the app's server; and per-IP limits cannot: requests that
-- do go through the app reach Supabase from the server's address, the same
-- for every visitor.
--
--   record_play        at most 100 different visitors per track and UTC day
--                      (a listener already counted today still counts,
--                      and may still mark the play completed)
--   cast_version_vote  at most 50 votes per group of versions (a voter
--                      already in still changes their pick)
--
-- Past a cap the function raises 53400 (configuration_limit_exceeded),
-- which the API answers with 429 (server/utils/errors.ts). The owner's own
-- plays are never capped. Both caps are generous for a group of friends:
-- what they stop is a script.
--
-- The plays cap counts people (browser ids), not plays: a friend who
-- replays a track for hours takes one place the first time and is never
-- refused afterwards that day, even once the 100 places are taken (and
-- their replays were already a single row a day: plays_once_a_day). Nor
-- does any cap ever stop the music: it only stops counting.
--
-- `create or replace` keeps each function, its signature and its grants;
-- the bodies are those of …_plays_and_votes.sql plus the cap.
-- =============================================================================

-- The cap's count: one track's visitors on one day.
create index plays_track_day_visitors_idx on public.plays (track_id, played_on, listener_id)
  where listener = 'visitor';

-- -----------------------------------------------------------------------------
-- record_play: as before, plus at most 100 different visitors per track and day.
-- -----------------------------------------------------------------------------
create or replace function public.record_play(
  p_track_id    uuid,
  p_playlist_id uuid,
  p_listener_id uuid,
  p_completed   boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- The signed-in user, or null for an anonymous visitor.
  v_caller   uuid := (select auth.uid());
  -- The playlist the track was really heard through (checked below).
  v_playlist uuid;
  -- The track's owner, found only when the caller may listen to it.
  v_owner    uuid;
  -- Today in UTC, the day a play is counted on (the plays.played_on default).
  v_today    date := (now() at time zone 'utc')::date;
begin
  -- A playlist context must be real: a shared playlist (or the caller's own) that contains the track.
  if p_playlist_id is not null then
    select p.id into v_playlist
    from public.playlists p
    join public.playlist_tracks pt on pt.playlist_id = p.id
    where p.id = p_playlist_id
      and pt.track_id = p_track_id
      and (p.visibility <> 'private' or p.user_id = v_caller);
    if v_playlist is null then
      raise exception 'track not found' using errcode = 'P0002';
    end if;
  end if;

  -- The track itself: reachable through that playlist, shared on its own, or the caller's.
  select t.user_id into v_owner
  from public.tracks t
  where t.id = p_track_id
    and (v_playlist is not null or t.visibility <> 'private' or t.user_id = v_caller);
  if v_owner is null then
    raise exception 'track not found' using errcode = 'P0002';
  end if;

  -- A visitor must say which browser they are (the API always sends it).
  if v_owner is distinct from v_caller and p_listener_id is null then
    raise exception 'listener id required' using errcode = '22P02';
  end if;

  -- The cap: a visitor not yet counted for this track today needs a free place.
  -- One already counted (replays, another context) always passes, cap reached or not.
  if v_owner is distinct from v_caller then
    -- One visitor's play of this track at a time until commit: parallel
    -- requests cannot all see the same free place.
    perform pg_advisory_xact_lock(hashtextextended('record_play:' || p_track_id::text, 0));
    if not exists (
      select 1 from public.plays p
      where p.track_id = p_track_id and p.played_on = v_today
        and p.listener = 'visitor' and p.listener_id = p_listener_id
    ) and (
      select count(distinct p.listener_id) from public.plays p
      where p.track_id = p_track_id and p.played_on = v_today and p.listener = 'visitor'
    ) >= 100 then
      raise exception 'too many listeners of this track today' using errcode = '53400';
    end if;
  end if;

  insert into public.plays (owner_id, track_id, playlist_id, listener, listener_id, completed)
  values (
    v_owner,
    p_track_id,
    v_playlist,
    case when v_owner = v_caller then 'owner' else 'visitor' end::public.listener_kind,
    case when v_owner = v_caller then v_caller else p_listener_id end,
    coalesce(p_completed, false)
  )
  -- Already counted today: only "completed" can change, and never back to false.
  on conflict on constraint plays_once_a_day
  do update set completed = public.plays.completed or excluded.completed;
end;
$$;

-- -----------------------------------------------------------------------------
-- cast_version_vote: as before, plus at most 50 votes per group. Votes for a
-- version since removed from the group still take their place (they are
-- still rows): what the cap bounds is the table.
-- -----------------------------------------------------------------------------
create or replace function public.cast_version_vote(
  p_playlist_id uuid,
  p_track_id    uuid,
  p_voter_id    uuid,
  p_name        text,
  p_comment     text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.check_version_voting(p_playlist_id, p_voter_id);

  if not exists (
    select 1 from public.playlist_tracks pt
    where pt.playlist_id = p_playlist_id and pt.track_id = p_track_id
  ) then
    raise exception 'version not found' using errcode = 'P0002';
  end if;

  -- The cap: a new voter needs a free place (one already in only changes their pick).
  -- One vote of this group at a time until commit, as for plays above.
  perform pg_advisory_xact_lock(hashtextextended('cast_version_vote:' || p_playlist_id::text, 0));
  if not exists (
    select 1 from public.version_votes v
    where v.playlist_id = p_playlist_id and v.voter_id = p_voter_id
  ) and (
    select count(*) from public.version_votes v where v.playlist_id = p_playlist_id
  ) >= 50 then
    raise exception 'too many votes in this group' using errcode = '53400';
  end if;

  insert into public.version_votes (playlist_id, voter_id, track_id, name, comment)
  values (p_playlist_id, p_voter_id, p_track_id, p_name, p_comment)
  on conflict (playlist_id, voter_id)
  do update set track_id = excluded.track_id, name = excluded.name, comment = excluded.comment;
end;
$$;
