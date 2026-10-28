-- =============================================================================
-- Chronovault — other people's shared files: signed by name, never listed
--
-- The read policy on storage.objects (…_storage.sql) let anyone, signed in or
-- not, read the rows of shared files (the covers and audio of non-private
-- tracks, of tracks inside non-private playlists, and the covers of
-- non-private playlists) for ANY Storage operation. The server only needs
-- one: signing a file whose exact name it already has (the share pages'
-- covers, sharing.service.ts). But Storage's list endpoint reads the same
-- rows, so with nothing but the public key, which ships with the site:
--
--   POST /storage/v1/object/list/covers {"prefix": ""}
--     → the folder of every user with a shared cover: their user ids;
--   POST /storage/v1/object/list/covers {"prefix": "<user id>"}
--     → <track id>.webp for every one of their shared tracks with a cover,
--       and playlists/<playlist id>.webp for their shared playlists:
--
-- the ids of every unlisted track, playlist and group of versions with a
-- cover, of every user, which open their pages. "Unlisted" means only whoever
-- was sent the link; listing made it anyone who looked.
--
-- Storage tells the database which operation a request is
-- (storage.operation(), read through storage.allow_any_operation()), so the
-- shared branch of the policy now holds for signing only: `object.sign` (one
-- file) and `object.sign_many` (the share page's mosaic). A list, a download
-- or an info request about someone else's shared file finds no row. A signed
-- URL, once made, is checked by its token alone, so the visitors' covers keep
-- loading. The owner's own folder is unchanged: every operation, list
-- included (the Storage dialog's inventory).
--
-- `alter policy` keeps the policy's name and roles and replaces its rule.
-- =============================================================================

alter policy "storage: read own or shared files"
  on storage.objects
  using (
    bucket_id in ('audio', 'covers')
    and (
      -- The caller's own folder: any operation.
      (storage.foldername(name))[1] = (select auth.uid())::text
      -- Someone else's shared file: only to sign it, by its exact name (never listed).
      or (
        storage.allow_any_operation(array['object.sign', 'object.sign_many'])
        and private.is_shared_track_file(bucket_id, name)
      )
    )
  );
