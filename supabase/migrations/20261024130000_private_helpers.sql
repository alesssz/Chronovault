-- =============================================================================
-- ChronoPlayer — internal functions out of the API
--
-- Every function in the `public` schema can be called through the Data API
-- (`POST /rest/v1/rpc/<name>`) by whoever holds `execute` on it, and
-- Supabase's default privileges grant `execute` on new functions in
-- `public` to anon and authenticated explicitly (so the earlier
-- `revoke … from public` statements did not hide them). The API is meant to
-- offer only the get_shared_* functions, the plays and votes functions, and
-- set_playlist_tracks for signed-in users. This migration takes the rest out:
--
-- - is_shared_track_file and owns_playlist are helpers of policies (storage
--   and RLS). The roles the policies run as still need `execute` on them, so
--   revoking is not an option: they move to a `private` schema instead,
--   which the API does not expose (supabase/config.toml `[api] schemas`, the
--   same default on Supabase Cloud). Policies refer to a function by its
--   identity, not its name, so they keep working after the move.
-- - set_playlist_tracks called owns_playlist by name: it is recreated to call
--   private.owns_playlist, and anon loses `execute` (it could only fail).
-- - The trigger functions are never meant to be called directly: no role gets
--   `execute` (a trigger fires whatever the privileges of the user).
--
-- supabase/tests/database/function_privileges.test.sql lists exactly what
-- each role may call, so a new function exposed by mistake fails the tests.
-- =============================================================================

-- Not exposed by the API. Usage only for the roles whose policies call into it.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Policy helpers move out of `public`. Their bodies use fully qualified names
-- (empty search_path), so they work unchanged from the new schema.
-- -----------------------------------------------------------------------------
alter function public.is_shared_track_file(text, text) set schema private;
alter function public.owns_playlist(uuid) set schema private;

-- The storage policy "read own or shared files" runs as anon and authenticated.
revoke all on function private.is_shared_track_file(text, text) from public, anon, authenticated;
grant execute on function private.is_shared_track_file(text, text) to anon, authenticated;

-- The playlist_tracks and version_votes policies run as authenticated only.
revoke all on function private.owns_playlist(uuid) from public, anon, authenticated;
grant execute on function private.owns_playlist(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- set_playlist_tracks: same as before (…_playlists.sql), calling the helper
-- in its new place. `create or replace` keeps the function and its grants.
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

  delete from public.playlist_tracks where playlist_id = p_playlist_id;

  insert into public.playlist_tracks (playlist_id, track_id, position)
  select p_playlist_id, ids.track_id, (ids.ord - 1)::integer
  from unnest(p_track_ids) with ordinality as ids (track_id, ord);

  update public.playlists set updated_at = now() where id = p_playlist_id;
end;
$$;

-- Signed-in users only: an anonymous call could only fail.
revoke all on function public.set_playlist_tracks(uuid, uuid[]) from public, anon;
grant execute on function public.set_playlist_tracks(uuid, uuid[]) to authenticated;

-- -----------------------------------------------------------------------------
-- Trigger functions: fired by their triggers, never called by anyone.
-- -----------------------------------------------------------------------------
revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.prevent_owner_change() from public, anon, authenticated;
