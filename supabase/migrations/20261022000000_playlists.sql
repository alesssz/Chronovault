-- =============================================================================
-- ChronoPlayer — playlists
--
-- A playlist is an ordered list of its owner's tracks. Like tracks, it is
-- 'private', 'unlisted' or 'public'. Sharing a playlist shares everything in
-- it: anyone with its link can listen to all its tracks, private ones
-- included, but only inside the playlist (a private track never gets a page
-- of its own). The Suno prompt and the mastering status are never shared.
-- =============================================================================

create table public.playlists (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title       text not null check (char_length(btrim(title)) between 1 and 200),
  description text check (char_length(description) <= 5000),
  visibility  public.track_visibility not null default 'private',
  -- custom cover; without it the app shows a mosaic of the tracks' covers
  cover_path  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint playlists_cover_path_owner check (cover_path is null or split_part(cover_path, '/', 1) = user_id::text)
);

create index playlists_user_created_idx on public.playlists (user_id, created_at desc);

create trigger playlists_set_updated_at
  before update on public.playlists
  for each row execute function public.set_updated_at();

create trigger playlists_prevent_owner_change
  before update on public.playlists
  for each row execute function public.prevent_owner_change();

-- A track appears at most once per playlist; `position` gives the order.
create table public.playlist_tracks (
  playlist_id uuid not null references public.playlists (id) on delete cascade,
  track_id    uuid not null references public.tracks (id) on delete cascade,
  position    integer not null check (position >= 0),
  primary key (playlist_id, track_id)
);

create index playlist_tracks_track_idx on public.playlist_tracks (track_id);
create index playlist_tracks_order_idx on public.playlist_tracks (playlist_id, position);

-- -----------------------------------------------------------------------------
-- Row Level Security: playlists are visible and editable by their owner only.
-- Other people reach shared playlists through get_shared_playlist*().
-- -----------------------------------------------------------------------------
alter table public.playlists enable row level security;
alter table public.playlist_tracks enable row level security;

create policy "playlists: read own"
  on public.playlists for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "playlists: insert own"
  on public.playlists for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "playlists: update own"
  on public.playlists for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "playlists: delete own"
  on public.playlists for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- True when the current user owns the playlist.
create function public.owns_playlist(p_playlist_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1 from public.playlists p
    where p.id = p_playlist_id and p.user_id = (select auth.uid())
  );
$$;

create policy "playlist tracks: read own"
  on public.playlist_tracks for select
  to authenticated
  using (public.owns_playlist(playlist_id));

-- Only the owner's own tracks can be added to the owner's playlists.
create policy "playlist tracks: insert own"
  on public.playlist_tracks for insert
  to authenticated
  with check (
    public.owns_playlist(playlist_id)
    and exists (select 1 from public.tracks t where t.id = track_id and t.user_id = (select auth.uid()))
  );

create policy "playlist tracks: update own"
  on public.playlist_tracks for update
  to authenticated
  using (public.owns_playlist(playlist_id))
  with check (public.owns_playlist(playlist_id));

create policy "playlist tracks: delete own"
  on public.playlist_tracks for delete
  to authenticated
  using (public.owns_playlist(playlist_id));

revoke all on table public.playlists, public.playlist_tracks from anon, authenticated;
grant select, insert, update, delete on table public.playlists, public.playlist_tracks to authenticated;

revoke all on function public.owns_playlist(uuid) from public;
grant execute on function public.owns_playlist(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Replaces the tracks of a playlist with `p_track_ids`, in that order.
-- One transaction: the playlist is never left half-updated. Runs with the
-- caller's rights, so RLS still checks every row.
-- -----------------------------------------------------------------------------
create function public.set_playlist_tracks(p_playlist_id uuid, p_track_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.owns_playlist(p_playlist_id) then
    raise exception 'playlist not found' using errcode = 'P0002';
  end if;

  delete from public.playlist_tracks where playlist_id = p_playlist_id;

  insert into public.playlist_tracks (playlist_id, track_id, position)
  select p_playlist_id, ids.track_id, (ids.ord - 1)::integer
  from unnest(p_track_ids) with ordinality as ids (track_id, ord);

  update public.playlists set updated_at = now() where id = p_playlist_id;
end;
$$;

revoke all on function public.set_playlist_tracks(uuid, uuid[]) from public;
grant execute on function public.set_playlist_tracks(uuid, uuid[]) to authenticated;

-- -----------------------------------------------------------------------------
-- Link access to non-private playlists ('unlisted' and 'public').
-- security definer: they also read the owner's private tracks, but only the
-- shareable fields, and only through a non-private playlist.
-- -----------------------------------------------------------------------------
create function public.get_shared_playlist(p_playlist_id uuid)
returns table (
  id          uuid,
  title       text,
  description text,
  cover_path  text,
  visibility  public.track_visibility,
  updated_at  timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.title, p.description, p.cover_path, p.visibility, p.updated_at
  from public.playlists p
  where p.id = p_playlist_id
    and p.visibility <> 'private';
$$;

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
  updated_at       timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    pt.position, t.id, t.title, t.composers, t.album, t.year, g.name, t.description,
    t.lyrics, t.lyrics_synced, t.duration_seconds, t.peaks, t.cover_path, t.audio_path, t.updated_at
  from public.playlists p
  join public.playlist_tracks pt on pt.playlist_id = p.id
  join public.tracks t on t.id = pt.track_id
  left join public.genres g on g.id = t.genre_id
  where p.id = p_playlist_id
    and p.visibility <> 'private'
  order by pt.position;
$$;

revoke all on function public.get_shared_playlist(uuid) from public;
revoke all on function public.get_shared_playlist_tracks(uuid) from public;
grant execute on function public.get_shared_playlist(uuid) to anon, authenticated;
grant execute on function public.get_shared_playlist_tracks(uuid) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Storage: files are also shared when they belong to a track inside a
-- non-private playlist, and so is the custom cover of a non-private playlist.
-- -----------------------------------------------------------------------------
create or replace function public.is_shared_track_file(p_bucket text, p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tracks t
    where (
        (p_bucket = 'audio' and t.audio_path = p_path)
        or (p_bucket = 'covers' and t.cover_path = p_path)
      )
      and (
        t.visibility <> 'private'
        or exists (
          select 1
          from public.playlist_tracks pt
          join public.playlists p on p.id = pt.playlist_id
          where pt.track_id = t.id and p.visibility <> 'private'
        )
      )
  )
  or (
    p_bucket = 'covers'
    and exists (
      select 1 from public.playlists p
      where p.cover_path = p_path and p.visibility <> 'private'
    )
  );
$$;
