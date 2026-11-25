-- =============================================================================
-- Chronovault — what a signed-in user may write to Storage, and how large a
-- track's data may be
--
-- 1. The `audio` bucket of Supabase Storage. Audio lives on Cloudflare R2 in
--    production; locally the app reaches this bucket through Storage's S3
--    endpoint, whose keys are the service's own and pass no policy. Yet the
--    write policies of …_storage.sql named it, so with the public key and a
--    session anyone signed in could store files of up to 500 MB each in their
--    folder of a bucket nothing reads, filling the project's storage (1 GB on
--    the Free plan) until covers fail to upload. No user writes it any more.
--
-- 2. Covers. The browser uploads them straight to Storage (useCoverStorage),
--    and the policies only asked for the user's own folder: any name, any
--    depth. A cover is now stored only under a name a row can point to
--    (…_storage_path_rules.sql): <user_id>/<uuid>.webp for a track,
--    <user_id>/playlists/<uuid>.webp for a playlist. Deleting stays open to
--    the whole own folder, so a file stored under the old rules can still go.
--    The bucket takes WebP only, up to 3 MB: the app stores 800×800 WebP
--    (app/lib/image.ts), 50–150 kB, but a browser that cannot encode WebP
--    (Safari) hands back a PNG under the same type, at most 800×800×4 bytes,
--    about 2.5 MB. Storage checks the declared type, not the bytes.
--
-- 3. A track's JSON and MIME type. The API checks them (shared/schemas/
--    track.ts), but a signed-in user may write their own rows straight
--    through the Data API, and the database only asked for a JSON array:
--    one row could hold megabytes of waveform or lyrics, and every page that
--    lists or shares the track would carry them. The constraints below are
--    the API's rules, so nothing the app sends is refused:
--      peaks          at most 1000 numbers between 0 and 1 (PEAKS_RESOLUTION)
--      lyrics_synced  at most 2000 lines {time 0..86400, text ≤ 500 characters,
--                     section true/false optional}, nothing else
--      mime_type      audio/<subtype>, at most 100 characters
--    The JSON checks are SQL/JSON paths: `strict`, so an array nested inside
--    the array is an error rather than unwrapped, plus a `lax` one for the
--    keys every line must have (strict cannot test a missing key). A text
--    over 500 characters is matched as 250 twice plus one: the regular
--    expressions repeat at most 255 times. `case` first makes sure the value
--    is an array: jsonb_array_length() of anything else is an error, not a
--    refused row, and `and` does not promise to test the type first.
--
-- Existing rows already follow these rules (the API wrote them); one that
-- did not would make this migration fail as a whole, changing nothing.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1–2. Storage writes: covers only, under the names rows point to
-- -----------------------------------------------------------------------------
alter policy "storage: upload into own folder"
  on storage.objects
  with check (
    bucket_id = 'covers'
    and name ~ ('^' || (select auth.uid())::text
                || '/(playlists/)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$')
  );

-- Upserts replace a cover through this policy: the same names.
alter policy "storage: overwrite in own folder"
  on storage.objects
  using (
    bucket_id = 'covers'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'covers'
    and name ~ ('^' || (select auth.uid())::text
                || '/(playlists/)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$')
  );

alter policy "storage: delete in own folder"
  on storage.objects
  using (
    bucket_id = 'covers'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

update storage.buckets
set file_size_limit = 3145728, allowed_mime_types = array['image/webp']
where id = 'covers';

-- -----------------------------------------------------------------------------
-- 3. A track's waveform, synced lyrics and MIME type: the API's own limits
-- -----------------------------------------------------------------------------
alter table public.tracks
  add constraint tracks_peaks_shape check (
    peaks is null
    or case when jsonb_typeof(peaks) = 'array' then
      jsonb_array_length(peaks) <= 1000
      and not jsonb_path_exists(peaks, 'strict $[*] ? (@.type() != "number" || @ < 0 || @ > 1)')
    else false end
  ),
  add constraint tracks_lyrics_synced_shape check (
    lyrics_synced is null
    or case when jsonb_typeof(lyrics_synced) = 'array' then
      jsonb_array_length(lyrics_synced) <= 2000
      and not jsonb_path_exists(lyrics_synced, 'strict $[*] ? (
        @.type() != "object"
        || @.time.type() != "number" || @.time < 0 || @.time > 86400
        || @.text.type() != "string" || @.text like_regex "^(.{250}){2}." flag "s"
        || (exists(@.section) && @.section.type() != "boolean")
        || exists(@.keyvalue() ? (@.key != "time" && @.key != "text" && @.key != "section"))
      )')
      and not jsonb_path_exists(lyrics_synced, 'lax $[*] ? (!exists(@.time) || !exists(@.text))')
    else false end
  ),
  add constraint tracks_mime_type_audio check (
    char_length(mime_type) <= 100 and mime_type ~ '^audio/[A-Za-z0-9_.+-]+$'
  );
