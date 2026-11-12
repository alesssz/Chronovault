-- =============================================================================
-- Chronovault — replacing a track's audio file
--
-- A track uploaded before mastering can get its mastered file while keeping
-- everything else (metadata, lyrics, cover, plays, votes, playlists, share
-- links): "Replace audio" in the track editor (docs/07-data-flows.md 7.19).
--
-- 1. Where the new file goes. A track's audio was exactly
--    `<user_id>/<id>.<extension>` (…_storage_path_rules.sql). The new file is
--    uploaded NEXT TO the old one, at `<user_id>/<id>.<revision>.<extension>`
--    (8 random lower-case hex characters drawn by the server), and the row
--    moves to it only once it is verified; the old file is deleted after.
--    Overwriting the same key instead would lose the old file before the row
--    is updated (a failure in between leaves a track whose size, duration and
--    waveform describe a file that no longer exists), and a new format
--    (MP3 → FLAC) changes the key anyway. The rule stays as strict as before:
--    the path still names a file of this very track, in its owner's folder,
--    and nothing else (no `..`, no other id, no nested folder).
--
-- 2. sync_needs_review. A master may trim or shift the audio, so the synced
--    lyrics, timed against the previous file, may be off. They are kept (a few
--    lines nudged usually fix them) and flagged: the editor's Sync tab says so
--    until the owner marks the sync as checked, and the library shows the
--    synced-lyrics icon in a warning colour. Set by the app's server when it
--    replaces the audio of a track with synced lyrics; cleared by the owner,
--    or by the server when the synced lyrics are emptied. The table's update
--    grant (…_grants.sql) already covers the new column, and RLS limits it to
--    the owner's rows, like every other column.
-- =============================================================================

alter table public.tracks
  drop constraint tracks_audio_path_exact,
  -- The audio file of this very track, in its owner's folder: the first upload's
  -- `<user_id>/<id>.<ext>`, or a replacement's `<user_id>/<id>.<revision>.<ext>`.
  add constraint tracks_audio_path_exact
    check (audio_path ~ ('^' || user_id::text || '/' || id::text || '(\.[0-9a-f]{8})?\.[a-z0-9]{1,10}$'));

alter table public.tracks
  add column sync_needs_review boolean not null default false;

comment on column public.tracks.sync_needs_review is
  'The audio was replaced after the lyrics were synced: their times may be off until the owner checks them.';
