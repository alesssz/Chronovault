-- =============================================================================
-- Chronovault — storage paths are exactly the ones the app builds
--
-- Until now a track's paths only had to start with its owner's folder
-- (`split_part(path, '/', 1) = user_id`). The app's server checks paths
-- strictly (isTrackPath), but a signed-in user may also write their own
-- rows straight through the Data API, skipping the server, and a path such
-- as `<own id>/../<other id>/<track>.flac` passed that rule. When the
-- server later signed it for the audio storage, URL parsing resolved the
-- `..` and the signature covered the other user's file: deleting the forged
-- track deleted the victim's audio, and its playback streamed it. The keys
-- of shared tracks are returned by the get_shared_* functions, so any
-- shared track was reachable that way.
--
-- Every path is now exactly what shared/utils/storage-paths.ts builds:
--   tracks.audio_path     <user_id>/<id>.<extension>   (a-z and digits, as normalized)
--   tracks.cover_path     <user_id>/<id>.webp
--   playlists.cover_path  <user_id>/playlists/<id>.webp
-- so no row can name a file other than its own. The server also refuses
-- to sign any key with an empty, `.` or `..` segment (isSafeStorageKey),
-- whatever the database holds.
--
-- Existing rows already follow these shapes (the server only ever wrote
-- them); a row that did not would make this migration fail as a whole,
-- leaving the old rules in place.
-- =============================================================================

alter table public.tracks
  drop constraint tracks_audio_path_owner,
  drop constraint tracks_cover_path_owner,
  -- The audio file of this very track, in its owner's folder.
  add constraint tracks_audio_path_exact
    check (audio_path ~ ('^' || user_id::text || '/' || id::text || '\.[a-z0-9]{1,10}$')),
  -- The cover of this very track (covers are always WebP).
  add constraint tracks_cover_path_exact
    check (cover_path is null or cover_path = user_id::text || '/' || id::text || '.webp');

alter table public.playlists
  drop constraint playlists_cover_path_owner,
  -- The custom cover of this very playlist.
  add constraint playlists_cover_path_exact
    check (cover_path is null or cover_path = user_id::text || '/playlists/' || id::text || '.webp');
