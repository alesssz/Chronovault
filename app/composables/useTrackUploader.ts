import type { Genre } from '~~/shared/types/track'
import { MAX_AUDIO_BYTES, resolveAudioMimeType, storageExtension } from '~~/shared/utils/audio-files'
import { AUDIO_BUCKET, COVERS_BUCKET, buildAudioPath, buildCoverPath } from '~~/shared/utils/storage-paths'
import { analyzeAudioFile } from '~/lib/audio-analysis'
import { convertWavToFlac } from '~/lib/flac/convert'
import { isWavFile } from '~/lib/flac/wav'
import { toSquareWebp } from '~/lib/image'
import { resumableUpload } from '~/lib/resumable-upload'
import { genresApi, tracksApi } from '~/services/api'

export type UploadStatus = 'queued' | 'analyzing' | 'converting' | 'uploading' | 'saving' | 'done' | 'error'

/** Outcome of the WAV → FLAC step (null for non-WAV files). */
export type UploadConversion
  = | { kind: 'flac', originalBytes: number, flacBytes: number }
    | { kind: 'kept', reason: string }

export interface UploadItem {
  key: string
  file: File
  title: string
  status: UploadStatus
  /** 0..1, progress of the WAV → FLAC conversion (encoding + verification). */
  conversionProgress: number
  conversion: UploadConversion | null
  /** 0..1, upload progress of the audio file. */
  progress: number
  error: string | null
  trackId: string | null
}

/**
 * Track upload queue. For each file:
 *   1. in-browser analysis (tags, cover, duration, peaks)
 *   2. WAV only: lossless conversion to FLAC, verified bit for bit
 *      (when it cannot be verified, the original WAV is uploaded instead)
 *   3. resumable upload of the audio straight into Storage
 *   4. upload of the cover (resized to WebP), when the tags contain one
 *   5. track registration through POST /api/tracks
 * If step 5 fails, the files already uploaded are removed.
 */
export function useTrackUploader() {
  const supabase = useSupabaseClient()
  const user = useSupabaseUser()
  const config = useRuntimeConfig()

  const items = ref<UploadItem[]>([])
  const running = ref(false)
  let genres: Genre[] | null = null

  const pending = computed(() => items.value.filter(i => i.status !== 'done' && i.status !== 'error').length)
  const completed = computed(() => items.value.filter(i => i.status === 'done').length)

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
    const removable: UploadStatus[] = ['queued', 'done', 'error']
    items.value = items.value.filter(i => i.key !== key || !removable.includes(i.status))
  }

  function clearFinished(): void {
    items.value = items.value.filter(i => i.status !== 'done' && i.status !== 'error')
  }

  async function run(): Promise<void> {
    if (running.value) return
    running.value = true
    try {
      let item: UploadItem | undefined
      while ((item = items.value.find(i => i.status === 'queued'))) {
        await process(item)
      }
    }
    finally {
      running.value = false
    }
  }

  async function getAccessToken(): Promise<string> {
    const { data } = await supabase.auth.getSession()
    if (!data.session) throw new Error('Session expired: please sign in again')
    return data.session.access_token
  }

  async function findGenreId(name: string | null): Promise<string | null> {
    if (!name) return null
    genres ??= await genresApi.list().catch(() => [])
    const wanted = name.trim().toLocaleLowerCase('en')
    return genres.find(g => g.name.toLocaleLowerCase('en') === wanted)?.id ?? null
  }

  async function process(item: UploadItem): Promise<void> {
    const userId = user.value?.sub
    let audioPath: string | null = null
    let coverPath: string | null = null

    try {
      if (!userId) throw new Error('Session expired: please sign in again')

      item.status = 'analyzing'
      const analysis = await analyzeAudioFile(item.file)
      item.title = analysis.title

      // Lossless WAV → FLAC: same audio, roughly half the size.
      let audioFile = item.file
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

      const trackId = crypto.randomUUID()
      audioPath = buildAudioPath(userId, trackId, storageExtension(audioFile))

      item.status = 'uploading'
      await resumableUpload({
        supabaseUrl: config.public.supabase.url,
        apiKey: config.public.supabase.key,
        getAccessToken,
        bucket: AUDIO_BUCKET,
        path: audioPath,
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
        audioPath,
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
      // No orphaned files in storage when the track was not registered.
      if (audioPath) await supabase.storage.from(AUDIO_BUCKET).remove([audioPath])
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
