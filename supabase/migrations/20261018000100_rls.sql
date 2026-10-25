-- =============================================================================
-- Chronovault — Row Level Security
-- General rule: users read and modify only their own data.
-- Exceptions: built-in genres (readable by everyone) and 'public' tracks.
-- 'unlisted' tracks are readable by id only, through get_shared_track().
--
-- NOTE: the "tracks: read own and public" policy and get_shared_track() below
-- were replaced by 20261021000000_public_sharing.sql (the table is now
-- owner-only and the function returns shareable fields only). The statements
-- of an applied migration are never changed: later migrations alter what it created.
--
-- `(select auth.uid())` instead of `auth.uid()`: Postgres evaluates it once
-- per query instead of once per row (Supabase performance advice).
-- =============================================================================

alter table public.genres enable row level security;
alter table public.tracks enable row level security;

-- -----------------------------------------------------------------------------
-- genres
-- -----------------------------------------------------------------------------
create policy "genres: read built-in and own"
  on public.genres for select
  to anon, authenticated
  using (user_id is null or user_id = (select auth.uid()));

create policy "genres: insert own"
  on public.genres for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "genres: update own"
  on public.genres for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "genres: delete own"
  on public.genres for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- tracks
-- -----------------------------------------------------------------------------
create policy "tracks: read own and public"
  on public.tracks for select
  to anon, authenticated
  using (user_id = (select auth.uid()) or visibility = 'public');

create policy "tracks: insert own"
  on public.tracks for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "tracks: update own"
  on public.tracks for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "tracks: delete own"
  on public.tracks for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- Link access to non-private tracks ('unlisted' and 'public').
-- security definer: bypasses RLS, but only ever returns non-private tracks.
-- -----------------------------------------------------------------------------
create function public.get_shared_track(p_track_id uuid)
returns setof public.tracks
language sql
stable
security definer
set search_path = ''
as $$
  select *
  from public.tracks
  where id = p_track_id
    and visibility <> 'private';
$$;

revoke all on function public.get_shared_track(uuid) from public;
grant execute on function public.get_shared_track(uuid) to anon, authenticated;
