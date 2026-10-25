import { COVERS_BUCKET } from '~~/shared/utils/storage-paths'
import { toSquareWebp, type CropRect } from '~/lib/image'

/**
 * Covers go straight from the browser to Supabase Storage (the private
 * `covers` bucket), into the user's own folder: storage RLS refuses any
 * other folder. The server only stores the path (PATCH coverPath) and
 * deletes files it no longer references.
 *
 * Used by the upload queue (covers found in the tags) and by the cover
 * pickers of the track and playlist pages (useCoverEditor).
 */
export function useCoverStorage() {
  // The browser's Supabase client: it carries the user's session.
  const supabase = useSupabaseClient()
  // The signed-in user: their id is the first folder of every cover path.
  const user = useSupabaseUser()

  /** The signed-in user's id (`<userId>/…` paths), or null when the session is gone. */
  const userId = computed(() => user.value?.sub ?? null)

  /**
   * Converts `image` to a square WebP (the `crop` area, or the centered
   * square) and stores it at `path`, replacing any previous file. Throws
   * when conversion or upload fails.
   */
  async function upload(path: string, image: Blob, crop?: CropRect): Promise<void> {
    // The image cropped, resized and converted (at most 800×800 WebP).
    const webp = await toSquareWebp(image, { crop })
    // Uploaded into the user's own folder (storage RLS checks it), replacing an older cover.
    const { error } = await supabase.storage.from(COVERS_BUCKET).upload(path, webp, {
      contentType: 'image/webp',
      upsert: true,
    })
    if (error) throw error
  }

  /** Deletes cover files, best effort (an orphan left behind is found by the storage clean-up). */
  async function remove(paths: string[]): Promise<void> {
    if (paths.length) await supabase.storage.from(COVERS_BUCKET).remove(paths)
  }

  return { userId, upload, remove }
}
