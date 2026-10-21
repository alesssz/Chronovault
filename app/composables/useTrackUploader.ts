import type { Genre } from '~~/shared/types/track'
import { MAX_AUDIO_BYTES, resolveAudioMimeType, storageExtension } from '~~/shared/utils/audio-files'
import { COVERS_BUCKET, buildCoverPath } from '~~/shared/utils/storage-paths'
import { analyzeAudioFile } from '~/lib/audio-analysis'
import { convertWavToFlac } from '~/lib/flac/convert'
import { isWavFile } from '~/lib/flac/wav'
import { toSquareWebp } from '~/lib/image'
import { directUpload } from '~/lib/direct-upload'
import { genresApi, tracksApi } from '~/services/api'

/** Lifecycle of one file, in order; `error` can happen at any step. */
export type UploadStatus = 'queued' | 'analyzing' | 'converting' | 'uploading' | 'saving' | 'done' | 'error'

/** Outcome of the WAV → FLAC step (null for non-WAV files). */
export type UploadConversion
  = | { kind: 'flac', originalBytes: number, flacBytes: number }
    | { kind: 'kept', reason: string }

/** One file in the upload list (reactive: the page renders these directly). */
export interface UploadItem {
  /** Unique list key (the same file may be dropped twice). */
  key: string
  file: File
  /** File name at first, then the title read from the tags. */
  title: string
  status: UploadStatus
  /** 0..1, progress of the WAV → FLAC conversion (encoding + verification). */
  conversionProgress: number
  conversion: UploadConversion | null
  /** 0..1, upload progress of the audio file. */
  progress: number
  error: string | null
  /** Set once registered: the page links to the new track's edit page. */
  trackId: string | null
}

/**
 * Track upload queue. For each file:
 *   1. in-browser analysis (tags, cover, duration, peaks)
 *   2. WAV only: lossless conversion to FLAC, verified bit for bit
 *      (when it cannot be verified, the original WAV is uploaded instead)
 *   3. upload of the audio straight to the audio storage (Cloudflare R2)
 *      through a presigned URL from POST /api/tracks/upload-url
 *   4. upload of the cover (resized to WebP) to Supabase Storage, when the tags contain one
 *   5. track registration through POST /api/tracks
 * If step 5 fails, the server removes the uploaded audio and the client the cover.
 */
export function useTrackUploader() {
  // Covers are uploaded straight to Supabase Storage by the browser.
  const supabase = useSupabaseClient()
  // The user id builds the storage paths (`<userId>/…`).
  const user = useSupabaseUser()

  /** Every file of the session, in the order it was added (the page renders this list). */
  const items = ref<UploadItem[]>([])
  /** True while the queue is being processed (one file at a time). */
  const running = ref(false)
  /** Genre list, loaded once per page to match the genre tag to a genre id. */
  let genres: Genre[] | null = null

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
      while ((item = items.value.find(i => i.status === 'queued'))) {
        await process(item)
      }
    }
    finally {
      running.value = false
    }
  }

  /** Built-in or custom genre whose name matches the tag (case-insensitive), or null. */
  async function findGenreId(name: string | null): Promise<string | null> {
    if (!name) return null
    genres ??= await genresApi.list().catch(() => [])
    const wanted = name.trim().toLocaleLowerCase('en')
    return genres.find(g => g.name.toLocaleLowerCase('en') === wanted)?.id ?? null
  }

  /** Runs steps 1-5 for one file; any failure marks the item as failed and cleans up. */
  async function process(item: UploadItem): Promise<void> {
    // Needed for every storage path; no session = the item fails with a clear message.
    const userId = user.value?.sub
    // Set once the cover is uploaded, so a failure can remove it again.
    let coverPath: string | null = null

    try {
      if (!userId) throw new Error('Session expired: please sign in again')

      item.status = 'analyzing'
      const analysis = await analyzeAudioFile(item.file)
      item.title = analysis.title

      // Lossless WAV → FLAC: same audio, roughly half the size.
      let audioFile = item.file
      // What is uploaded: the original file, or the verified FLAC when a WAV converts.
      let mimeType = analysis.mimeType
      if (isWavFile(item.file)) {
        item.status = 'converting'
        const result = await convertWavToFlac(item.file, (fraction) => {
          item.conversionProgress = fraction
        })
        if (result.status === 'converted') {
          audioFile = result.file
          mimeType = 'audio/flac'
          item.conversion = { kind: 'flac', originalBytes: item.file.size, flacBytes: audioFile.size }
        }
        else {
          item.conversion = { kind: 'kept', reason: result.reason }
        }
      }

      // The client picks the track id: the storage path depends on it, and the
      // file must be uploaded before the track row exists.
      const trackId = crypto.randomUUID()

      item.status = 'uploading'
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
        genreId: await findGenreId(analysis.genre),
        lyrics: analysis.lyrics,
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
      if (coverPath) await supabase.storage.from(COVERS_BUCKET).remove([coverPath])
    }
  }

  /** The cover is optional: if it fails, the track is saved anyway. */
  async function uploadCover(userId: string, trackId: string, source: Blob): Promise<string | null> {
    try {
      const webp = await toSquareWebp(source)
      const path = buildCoverPath(userId, trackId)
      const { error } = await supabase.storage.from(COVERS_BUCKET).upload(path, webp, {
        contentType: 'image/webp',
        upsert: true,
      })
      return error ? null : path
    }
    catch {
      return null
    }
  }

  return { items, running, pending, completed, add, remove, clearFinished }
}
