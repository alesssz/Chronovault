-- =============================================================================
-- Chronovault — version groups
--
-- "Share for feedback" in the library puts 2-3 versions of a song (Suno
-- drafts) into an unlisted playlist whose link goes to friends. Those groups
-- used to be ordinary playlists, mixed in with the real ones on the
-- Playlists page and in every "Add to playlist" menu.
--
-- A playlist now has a `purpose`:
--   'playlist' → a playlist the user curates (Playlists page)
--   'versions' → a group of versions of one song sent for feedback
--                (Versions page)
-- Both are stored, shared and played the same way (same tables, RLS, share
-- links /p/:id, storage rules): only where the app lists them differs, and
-- the public page words them differently.
-- =============================================================================

create type public.playlist_purpose as enum ('playlist', 'versions');

alter table public.playlists add column purpose public.playlist_purpose not null default 'playlist';

-- Each page lists one purpose, newest first: replaces (user_id, created_at desc).
drop index public.playlists_user_created_idx;
create index playlists_user_purpose_created_idx on public.playlists (user_id, purpose, created_at desc);

-- Groups made by "Share for feedback" before this migration: unlisted, and
-- named "<song> – versions" by the app (app/lib/feedback-playlist.ts).
update public.playlists
set purpose = 'versions'
where visibility = 'unlisted'
  and title like '% – versions';

-- -----------------------------------------------------------------------------
-- get_shared_playlist: same as before, plus `purpose` (the public page says
-- "Versions" instead of "Playlist"). A function's result type cannot change
-- in place, hence drop + create (and the grants again).
-- -----------------------------------------------------------------------------
drop function public.get_shared_playlist(uuid);

create function public.get_shared_playlist(p_playlist_id uuid)
returns table (
  id          uuid,
  title       text,
  description text,
  cover_path  text,
  visibility  public.track_visibility,
  purpose     public.playlist_purpose,
  updated_at  timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.title, p.description, p.cover_path, p.visibility, p.purpose, p.updated_at
  from public.playlists p
  where p.id = p_playlist_id
    and p.visibility <> 'private';
$$;

revoke all on function public.get_shared_playlist(uuid) from public;
grant execute on function public.get_shared_playlist(uuid) to anon, authenticated;
