-- =============================================================================
-- ChronoPlayer — explicit table privileges
--
-- Supabase projects can be created with or without "Automatically expose new
-- tables" (default grants to the anon/authenticated roles). These grants make
-- the app independent of that setting, and give each role only what it needs.
-- Row Level Security still decides which rows each user can see or change.
-- =============================================================================

revoke all on table public.genres, public.tracks from anon, authenticated;

grant usage on schema public to anon, authenticated;

-- Read: built-in genres are visible to everyone (RLS filters the rest).
grant select on table public.genres, public.tracks to anon, authenticated;

-- Write: signed-in users only (RLS limits them to their own rows).
grant insert, update, delete on table public.genres, public.tracks to authenticated;
