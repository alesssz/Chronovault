import type { Genre } from '~~/shared/types/track'
import { MAX_AUDIO_BYTES, resolveAudioMimeType, storageExtension } from '~~/shared/utils/audio-files'
import { buildCoverPath } from '~~/shared/utils/storage-paths'
import { resolveGenreName } from '~~/shared/utils/genres'
import { prepareAudio, type UploadConversion } from '~/lib/prepare-audio'
import { directUpload } from '~/lib/direct-upload'
import { genresApi, tracksApi } from '~/services/api'

/** Lifecycle of one file, in order; `error` can happen at any step. */
export type UploadStatus = 'queued' | 'analyzing' | 'converting' | 'uploading' | 'saving' | 'done' | 'error'

// The WAV → FLAC outcome lives with the step (lib/prepare-audio.ts), shared with Replace audio.
export type { UploadConversion } from '~/lib/prepare-audio'

/** One file in the upload list (reactive: the page renders these directly). */
export interface UploadItem {
  /** Unique list key (the same file may be dropped twice). */
  key: string
  /** The dropped file. */
  file: File
  /** File name at first, then the title read from the tags. */
  title: string
  /** Where the file is in the pipeline (queued, analyzing, converting, uploading, saving, done, error). */
  status: UploadStatus
  /** 0..1, progress of the WAV → FLAC conversion (encoding + verification). */
  conversionProgress: number
  /** What the WAV → FLAC step did (null until then, and for other formats). */
  conversion: UploadConversion | null
  /** 0..1, upload progress of the audio file. */
  progress: number
  /** Why it failed, shown under the file; null otherwise. */
  error: string | null
  /** Set once registered: the page links to the new track's edit page. */
  trackId: string | null
}

/**
 * Track upload queue. For each file:
 *   1. in-browser analysis (tags, cover, duration, peaks)
 *   2. WAV only: lossless conversion to FLAC, verified bit for bit
 *      (when it cannot be verified, the original WAV is uploaded instead);
 *      steps 1-2 are lib/prepare-audio.ts, shared with Replace audio
 *   3. upload of the audio straight to the audio storage (Cloudflare R2)
 *      through a presigned URL from POST /api/tracks/upload-url
 *   4. upload of the cover (resized to WebP) to Supabase Storage, when the tags contain one
 *   5. track registration through POST /api/tracks
 * If step 5 fails, the server removes the uploaded audio and the client the cover.
 */
export function useTrackUploader() {
  // Covers go straight to Supabase Storage; the user id builds every storage path (`<userId>/…`).
  const covers = useCoverStorage()

  /** Every file of the session, in the order it was added (the page renders this list). */
  const items = ref<UploadItem[]>([])
  /** True while the queue is being processed (one file at a time). */
  const running = ref(false)
  /** Genre list, loaded once per page to match the genre tag to a genre and subgenre. */
  let genres: Genre[] | null = null
  /**
   * The page went away (left after confirming, with files still queued): the
   * file in progress finishes, but no other starts. Nothing would show their
   * progress or their errors, and coming back to the page starts a new list,
   * whose own queue would have run beside this one.
   */
  let stopped = false
  onBeforeUnmount(() => {
    stopped = true
  })

  /** Files still to process or in progress (the page warns before closing while > 0). */
  const pending = computed(() => items.value.filter(i => i.status !== 'done' && i.status !== 'error').length)
  /** Files uploaded and registered. */
  const completed = computed(() => items.value.filter(i => i.status === 'done').length)

  /**
   * Queues files and starts processing. Unsupported or too large files are
   * added directly as failed, so the user sees why they were skipped.
   */
  function add(files: File[]): void {
    for (const file of files) {
      // Why the file is refused at once, or null when it can go.
      const invalid = !resolveAudioMimeType(file)
        ? 'Unsupported format'
        : file.size > MAX_AUDIO_BYTES ? 'File too large (max 500 MB)' : null
      items.value.push({
        key: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        title: file.name,
        status: invalid ? 'error' : 'queued',
        conversionProgress: 0,
        conversion: null,
        progress: 0,
        error: invalid,
        trackId: null,
      })
    }
    void run()
  }

  /** Removes an item that is not being processed (queued, done or failed). */
  function remove(key: string): void {
    // A file being processed cannot be removed from under the running step.
    const removable: UploadStatus[] = ['queued', 'done', 'error']
    items.value = items.value.filter(i => i.key !== key || !removable.includes(i.status))
  }

  /** Removes done and failed items from the list. */
  function clearFinished(): void {
    items.value = items.value.filter(i => i.status !== 'done' && i.status !== 'error')
  }

  /**
   * Processes queued items one by one (sequential: parallel uploads would
   * compete for bandwidth and memory, FLAC conversion is CPU-heavy).
   * Files added while running are picked up by the same loop.
   */
  async function run(): Promise<void> {
    if (running.value) return
    running.value = true
    try {
      // Always take the first queued item: files added meanwhile are picked up too.
      let item: UploadItem | undefined
      while (!stopped && (item = items.value.find(i => i.status === 'queued'))) {
        await process(item)
      }
    }
    finally {
      running.value = false
    }
  }

  /**
   * The genre and subgenre a genre tag names (resolveGenreName: a genre; a
   * built-in subgenre and its genre; one of the user's own subgenres), or
   * none. Nothing is created: a tag the lists do not know leaves the track
   * without a genre.
   */
  async function findGenre(name: string | null): Promise<{ genreId: string | null, subgenreId: string | null }> {
    if (!name) return { genreId: null, subgenreId: null }
    genres ??= await genresApi.list().catch(() => [])
    return resolveGenreName(genres, name) ?? { genreId: null, subgenreId: null }
  }

  /** Runs steps 1-5 for one file; any failure marks the item as failed and cleans up. */
  async function process(item: UploadItem): Promise<void> {
    // Needed for every storage path; no session = the item fails with a clear message.
    const userId = covers.userId.value
    // Set once the cover is uploaded, so a failure can remove it again.
    let coverPath: string | null = null

    try {
      if (!userId) throw new Error('Session expired: please sign in again')

      item.status = 'analyzing'
      // Analysis, then for a WAV the verified lossless FLAC (lib/prepare-audio.ts):
      // the same audio, roughly half the size.
      const prepared = await prepareAudio(item.file, {
        onAnalyzed: (analysis) => {
          item.title = analysis.title
        },
        onConverting: () => {
          item.status = 'converting'
        },
        onConversionProgress: (fraction) => {
          item.conversionProgress = fraction
        },
      })
      // What was read from the file, and what is uploaded (the file, or the FLAC a WAV became).
      const { analysis, file: audioFile, mimeType } = prepared
      item.conversion = prepared.conversion

      // The client picks the track id: the storage path depends on it, and the
      // file must be uploaded before the track row exists.
      const trackId = crypto.randomUUID()

      item.status = 'uploading'
      // A presigned PUT address in the user's folder.
      const target = await tracksApi.uploadUrl({
        trackId,
        extension: storageExtension(audioFile),
        mimeType,
        sizeBytes: audioFile.size,
      })
      await directUpload({
        url: target.uploadUrl,
        file: audioFile,
        contentType: mimeType,
        onProgress: (fraction) => {
          item.progress = fraction
        },
      })

      if (analysis.cover) {
        coverPath = await uploadCover(userId, trackId, analysis.cover)
      }

      item.status = 'saving'
      await tracksApi.create({
        id: trackId,
        title: analysis.title,
        composers: analysis.composers,
        album: analysis.album,
        year: analysis.year,
        // The tag's genre and subgenre ("Thrash Metal": Metal › Thrash Metal).
        ...await findGenre(analysis.genre),
        lyrics: analysis.lyrics,
        // Synced lyrics in the tags (e.g. a file downloaded from Chronovault) are kept.
        lyricsSynced: analysis.lyricsSynced,
        audioPath: target.audioPath,
        coverPath,
        mimeType,
        sizeBytes: audioFile.size,
        durationSeconds: analysis.durationSeconds,
        peaks: analysis.peaks,
      })

      item.trackId = trackId
      item.progress = 1
      item.status = 'done'
    }
    catch (error) {
      item.status = 'error'
      item.error = getErrorMessage(error, 'Upload failed')
      // No orphaned cover when the track was not registered
      // (the server takes care of the audio file).
      if (coverPath) await covers.remove([coverPath])
    }
  }

  /** The cover is optional (center-cropped from the tags): if it fails, the track is saved anyway. */
  async function uploadCover(userId: string, trackId: string, source: Blob): Promise<string | null> {
    // The cover's place in the user's folder, named after the track.
    const path = buildCoverPath(userId, trackId)
    try {
      await covers.upload(path, source)
      return path
    }
    catch {
      return null
    }
  }

  return { items, running, pending, completed, add, remove, clearFinished }
}
