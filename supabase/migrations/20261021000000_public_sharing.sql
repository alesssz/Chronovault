-- =============================================================================
-- Chronovault — public sharing
--
-- Other people (signed in or not) can only reach a track through
-- get_shared_track(id), and only when it is 'unlisted' or 'public'.
-- The function returns the shareable fields only: the Suno prompt and the
-- mastering status always stay private to the owner.
-- =============================================================================

-- The table itself is readable by its owner only (it used to also expose
-- every column of 'public' tracks to anyone holding the public API key).
drop policy "tracks: read own and public" on public.tracks;

create policy "tracks: read own"
  on public.tracks for select
  to authenticated
  using (user_id = (select auth.uid()));

revoke select on table public.tracks from anon;

-- Shareable fields of a non-private track, with its genre name.
drop function public.get_shared_track(uuid);

create function public.get_shared_track(p_track_id uuid)
returns table (
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
  updated_at       timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    t.id, t.title, t.composers, t.album, t.year, g.name, t.description,
    t.lyrics, t.lyrics_synced, t.duration_seconds, t.peaks, t.cover_path,
    t.audio_path, t.visibility, t.updated_at
  from public.tracks t
  left join public.genres g on g.id = t.genre_id
  where t.id = p_track_id
    and t.visibility <> 'private';
$$;

revoke all on function public.get_shared_track(uuid) from public;
grant execute on function public.get_shared_track(uuid) to anon, authenticated;
