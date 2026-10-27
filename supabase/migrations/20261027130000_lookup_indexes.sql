-- =============================================================================
-- Chronovault — indexes for lookups that read whole tables
--
-- - Cover paths. The storage policy "read own or shared files" asks
--   private.is_shared_track_file for every cover a visitor's page signs, and
--   it looks for the path among every user's tracks (`tracks.cover_path =
--   path`) and playlists (`playlists.cover_path = path`). Neither column had
--   an index (audio_path has one, from its unique constraint): each cover
--   cost a scan of the whole table, and a shared playlist's page signs up to
--   a thousand covers in one request. Partial: most rows have no cover.
-- - genres.user_id, the foreign key to the genre's owner (custom genres):
--   deleting a user checks it, and Supabase's advisors flag it unindexed.
-- =============================================================================

create index tracks_cover_path_idx on public.tracks (cover_path) where cover_path is not null;
create index playlists_cover_path_idx on public.playlists (cover_path) where cover_path is not null;
create index genres_user_id_idx on public.genres (user_id) where user_id is not null;
