import type { CropRect } from '~/lib/image'

/** What useCoverEditor needs to know about the item whose cover is edited. */
export interface CoverEditorOptions {
  /** Storage path of the item's cover in the user's folder (buildCoverPath, buildPlaylistCoverPath). */
  path: (userId: string) => string
  /** Saves the new cover path (`null` removes the cover; the server deletes the file). */
  save: (coverPath: string | null) => Promise<void>
}

/**
 * The cover picker of the track and playlist pages (TrackCoverPicker's
 * `select` and `remove` events). A new cover, already cropped by the user,
 * becomes a square WebP in the browser, goes to Supabase Storage (own
 * folder, overwriting the previous one), then the path is saved through
 * the API. Saving changes the item's `updated_at`, hence its cover address:
 * browsers fetch the new image.
 *
 *   const cover = useCoverEditor({ path, save })
 *   <TrackCoverPicker :busy="cover.busy" @select="cover.select" @remove="cover.remove" />
 */
export function useCoverEditor(options: CoverEditorOptions) {
  // Toast on success; failures are reported by the task runners.
  const toast = useToast()
  const covers = useCoverStorage()
  const uploading = useAsyncTask()
  const removing = useAsyncTask()

  /** An upload or removal is running (spinner over the cover). */
  const busy = computed(() => uploading.running || removing.running)

  /** New cover picked and cropped: upload, then save its path. */
  async function select(file: File, crop: CropRect): Promise<void> {
    // Needed for the storage path; no session = nothing to do.
    const userId = covers.userId.value
    if (!userId) return
    const done = await uploading.run(async () => {
      const path = options.path(userId)
      await covers.upload(path, file, crop)
      await options.save(path)
    }, 'Cover not updated')
    if (done) toast.add({ title: 'Cover updated', icon: 'i-lucide-image', color: 'success' })
  }

  /** "Remove cover": the server clears the path and deletes the file. */
  async function remove(): Promise<void> {
    await removing.run(() => options.save(null), 'Cover not removed')
  }

  // Reactive, like useAsyncTask: `cover.busy` is a plain boolean in templates.
  return reactive({ busy, select, remove })
}
