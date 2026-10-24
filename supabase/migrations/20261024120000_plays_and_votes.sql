-- =============================================================================
-- ChronoPlayer — plays and version votes
--
-- Plays: a track counts as played once someone has really listened to it
-- (30 seconds, or half of a shorter track; "completed" at 90%). Plays are
-- counted on the share pages and in the owner's own library, and kept
-- apart: `listener` says whether the owner or a visitor listened, and the
-- Statistics page shows the owner's own plays separately, so they never
-- inflate the visitors' numbers.
--
-- Version votes: on the public page of a group of versions (purpose
-- 'versions', made by "Share for feedback") each visitor can pick the
-- version they prefer, with an optional name and comment. Only the owner
-- sees the votes. Voting closes once one of the group's versions is marked
-- final (that is what the votes were for); marking it draft again reopens it.
--
-- Visitors have no account: the app gives each browser a random id
-- (app/lib/listener-id.ts), the same for plays and votes. It identifies
-- nothing but that browser, and only to count a listener once a day and to
-- let a visitor change their own vote.
--
-- Nobody writes to these tables directly: the record_play and
-- *_version_vote functions below check that the track or group is really
-- shared (or the caller's own) before writing, like the get_shared_*
-- functions do for reading.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Plays
-- -----------------------------------------------------------------------------

-- Who listened: the track's owner (own plays, shown apart) or anyone else.
create type public.listener_kind as enum ('visitor', 'owner');

create table public.plays (
  id           bigint generated always as identity primary key,
  -- The track's owner, copied here: RLS and the Statistics queries filter on it.
  owner_id     uuid not null references auth.users (id) on delete cascade,
  track_id     uuid not null references public.tracks (id) on delete cascade,
  -- The shared playlist (or group of versions) the track was heard through;
  -- null on a track's own page and in the owner's library. No foreign key on
  -- purpose: deleting a playlist keeps the plays heard through it (they
  -- still count for the track).
  playlist_id  uuid,
  listener     public.listener_kind not null,
  -- The visitor's browser id, or the owner's user id for own plays.
  listener_id  uuid not null,
  -- UTC day of the play: a listener counts once per track, context and day.
  played_on    date not null default ((now() at time zone 'utc')::date),
  -- Listened to (almost) the end: 90% of the track.
  completed    boolean not null default false,
  created_at   timestamptz not null default now(),

  -- Replaying a track the same day updates the row (completed) instead of
  -- adding one. `nulls not distinct`: the null playlist of a track page is
  -- one context like any other.
  constraint plays_once_a_day unique nulls not distinct (track_id, playlist_id, listener_id, played_on)
);

-- Statistics: one owner's plays over a period.
create index plays_owner_day_idx on public.plays (owner_id, played_on);
-- Versions page: the plays heard through one group.
create index plays_playlist_idx on public.plays (playlist_id) where playlist_id is not null;

alter table public.plays enable row level security;

-- The owner reads the plays of their tracks; nobody writes directly.
create policy "plays: read own"
  on public.plays for select
  to authenticated
  using (owner_id = (select auth.uid()));

revoke all on table public.plays from anon, authenticated;
grant select on table public.plays to authenticated;

-- -----------------------------------------------------------------------------
-- record_play: counts a play, or marks today's play completed.
--
-- Accepted only when the caller may listen to the track in that context:
--   - through a non-private playlist that contains it (or the caller's own playlist);
--   - on its own page, when it is not private;
--   - anywhere, when it is the caller's own track (library playback).
-- Anything else answers like a missing track (P0002 → 404).
-- The owner is recognised by the session, never by what the browser says:
-- their plays are 'owner' plays, under their user id.
-- -----------------------------------------------------------------------------
create function public.record_play(
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

revoke all on function public.record_play(uuid, uuid, uuid, boolean) from public;
grant execute on function public.record_play(uuid, uuid, uuid, boolean) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Version votes
-- -----------------------------------------------------------------------------

create table public.version_votes (
  playlist_id uuid not null references public.playlists (id) on delete cascade,
  -- The visitor's browser id (see the top of this file).
  voter_id    uuid not null,
  -- The version picked. A version removed from the group keeps the row,
  -- but the vote no longer counts (the queries join the group's tracks).
  track_id    uuid not null references public.tracks (id) on delete cascade,
  -- Optional: how the owner knows who voted, and why.
  name        text check (char_length(btrim(name)) between 1 and 60),
  comment     text check (char_length(btrim(comment)) between 1 and 1000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- One vote per visitor per group: voting again changes it.
  primary key (playlist_id, voter_id)
);

create index version_votes_track_idx on public.version_votes (track_id);

create trigger version_votes_set_updated_at
  before update on public.version_votes
  for each row execute function public.set_updated_at();

alter table public.version_votes enable row level security;

-- The group's owner reads its votes; nobody writes directly.
create policy "version votes: read own groups"
  on public.version_votes for select
  to authenticated
  using (public.owns_playlist(playlist_id));

revoke all on table public.version_votes from anon, authenticated;
grant select on table public.version_votes to authenticated;

-- -----------------------------------------------------------------------------
-- The owner of a shared group of versions, or null when the playlist is
-- private, missing or not a group. Internal: used by the functions below.
-- -----------------------------------------------------------------------------
create function public.shared_group_owner(p_playlist_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.user_id
  from public.playlists p
  where p.id = p_playlist_id
    and p.visibility <> 'private'
    and p.purpose = 'versions';
$$;

-- True while no version of the group is marked final (voting is open).
create function public.version_voting_open(p_playlist_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1
    from public.playlist_tracks pt
    join public.tracks t on t.id = pt.track_id
    where pt.playlist_id = p_playlist_id
      and t.status = 'final'
  );
$$;

-- Internal: only the functions below call them (as their owner). Supabase's
-- default privileges grant execute to anon and authenticated explicitly, so
-- revoking from `public` alone would leave them callable through the API.
revoke all on function public.shared_group_owner(uuid) from public, anon, authenticated;
revoke all on function public.version_voting_open(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Checks shared by the two vote-changing functions: the group is shared,
-- the caller is not its owner (42501 → 403: the owner chooses, friends vote),
-- the visitor said who they are, and voting is still open (55000 → 409).
-- -----------------------------------------------------------------------------
create function public.check_version_voting(p_playlist_id uuid, p_voter_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  -- Owner of the shared group (null: not a shared group).
  v_owner uuid := public.shared_group_owner(p_playlist_id);
begin
  if v_owner is null then
    raise exception 'group not found' using errcode = 'P0002';
  end if;
  if v_owner = (select auth.uid()) then
    raise exception 'the owner does not vote' using errcode = '42501';
  end if;
  if p_voter_id is null then
    raise exception 'voter id required' using errcode = '22P02';
  end if;
  if not public.version_voting_open(p_playlist_id) then
    raise exception 'voting is closed' using errcode = '55000';
  end if;
end;
$$;

-- Internal, like the two above.
revoke all on function public.check_version_voting(uuid, uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- cast_version_vote: the visitor's pick (and optional name and comment);
-- voting again replaces it. The version must belong to the group.
-- -----------------------------------------------------------------------------
create function public.cast_version_vote(
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

  insert into public.version_votes (playlist_id, voter_id, track_id, name, comment)
  values (p_playlist_id, p_voter_id, p_track_id, p_name, p_comment)
  on conflict (playlist_id, voter_id)
  do update set track_id = excluded.track_id, name = excluded.name, comment = excluded.comment;
end;
$$;

-- -----------------------------------------------------------------------------
-- withdraw_version_vote: the visitor takes their pick back (while voting is open).
-- -----------------------------------------------------------------------------
create function public.withdraw_version_vote(p_playlist_id uuid, p_voter_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.check_version_voting(p_playlist_id, p_voter_id);
  delete from public.version_votes v
  where v.playlist_id = p_playlist_id and v.voter_id = p_voter_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- get_version_vote: what the public page of a group needs to show the vote
-- buttons: whether voting is open, whether the caller is the owner (who
-- sees a note instead), and this visitor's current pick, if any (a pick of
-- a version since removed from the group counts as none). No row for a
-- private, missing or non-group playlist. Other people's votes are never
-- returned.
-- -----------------------------------------------------------------------------
create function public.get_version_vote(p_playlist_id uuid, p_voter_id uuid)
returns table (
  open     boolean,
  is_owner boolean,
  track_id uuid,
  name     text,
  comment  text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.version_voting_open(p.id),
    coalesce(p.user_id = (select auth.uid()), false),
    v.track_id,
    v.name,
    v.comment
  from public.playlists p
  left join public.version_votes v
    on v.playlist_id = p.id
    and v.voter_id = p_voter_id
    and exists (select 1 from public.playlist_tracks pt where pt.playlist_id = p.id and pt.track_id = v.track_id)
  where p.id = p_playlist_id
    and p.visibility <> 'private'
    and p.purpose = 'versions';
$$;

revoke all on function public.cast_version_vote(uuid, uuid, uuid, text, text) from public;
revoke all on function public.withdraw_version_vote(uuid, uuid) from public;
revoke all on function public.get_version_vote(uuid, uuid) from public;
grant execute on function public.cast_version_vote(uuid, uuid, uuid, text, text) to anon, authenticated;
grant execute on function public.withdraw_version_vote(uuid, uuid) to anon, authenticated;
grant execute on function public.get_version_vote(uuid, uuid) to anon, authenticated;
