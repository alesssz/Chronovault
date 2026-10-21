import { getExtension } from '~~/shared/utils/audio-files'
import { toJpeg } from '~/lib/image'
import { saveFile } from '~/lib/save-file'
import { downloadFileName, tagFormatOf, tagsFromTrack, type CoverImage, type TagFormat, type TrackTags, writeTrackTags } from '~/lib/tags/track-tags'
import { tracksApi } from '~/services/api'
import { getErrorMessage } from '~/utils/errors'

/**
 * "Download" of a track (library and playlist menus, edit page): the stored
 * audio file with the track's metadata written into it.
 *
 * Everything happens in the browser, because the file is far larger than a
 * Vercel function may return:
 *   1. track data and a fresh streaming URL from the API
 *   2. the file from storage (Cloudflare R2), with a progress toast
 *   3. the cover, re-encoded as JPEG (best effort: no cover rather than no download)
 *   4. tags written (FLAC, MP3, WAV; other formats are saved as stored)
 *   5. the result saved with the browser's download
 */
/**
 * The progress toast appears only when a download takes longer than this
 * (ms): a fast download shows just the final toast, instead of a toast that
 * flashes and vanishes (which looks like an error).
 */
const PROGRESS_TOAST_DELAY = 700

export function useTrackDownload() {
  // Progress and outcome of each download.
  const toast = useToast()
  // Genre names: the track only carries the genre id.
  const { genreName } = useGenres()
  /** Tracks being prepared right now (shared: a second click anywhere is ignored). */
  const active = useState<string[]>('track-downloads', () => [])

  /** A download of this track is being prepared (spinner on its button). */
  function isDownloading(trackId: string): boolean {
    return active.value.includes(trackId)
  }

  /**
   * Fetches a file, reporting progress (0..1) when the size is known.
   * Chunks are collected and joined at the end: content-length is only
   * used for the percentage, never trusted for the result.
   */
  async function fetchBytes(url: string, onProgress: (fraction: number) => void): Promise<Uint8Array> {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`The file could not be downloaded (HTTP ${response.status})`)
    const total = Number(response.headers.get('content-length')) || 0
    if (!response.body) return new Uint8Array(await response.arrayBuffer())

    const reader = response.body.getReader()
    // Pieces as they arrive, and how many bytes so far.
    const chunks: Uint8Array[] = []
    let received = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      received += value.length
      if (total) onProgress(Math.min(1, received / total))
    }
    // Join the pieces into one buffer of the real size.
    const out = new Uint8Array(received)
    let offset = 0
    for (const chunk of chunks) {
      out.set(chunk, offset)
      offset += chunk.length
    }
    return out
  }

  /** The track's cover as an embeddable JPEG, or null (no cover, or it could not be read). */
  async function coverForTags(coverUrl: string | null): Promise<CoverImage | null> {
    if (!coverUrl) return null
    try {
      const response = await fetch(coverUrl)
      if (!response.ok) return null
      const jpeg = await toJpeg(await response.blob())
      return { ...jpeg, mimeType: 'image/jpeg' }
    }
    catch {
      return null
    }
  }

  /**
   * The toast text: exactly which fields went into the file (empty ones are
   * not written), and what WAV cannot hold when the track has it.
   */
  function describeTags(tags: TrackTags, format: TagFormat, hasCover: boolean): string {
    // Field label (as shown in the toast) → value.
    const fields: [string, unknown][] = [
      ['title', tags.title], ['artist', tags.artist], ['album', tags.album], ['year', tags.year],
      ['genre', tags.genre], ['comment', tags.comment],
    ]
    // WAV has no standard place for these two.
    if (format !== 'wav') fields.push(['lyrics', tags.lyrics], ['cover', tags.cover])
    const written = fields.filter(([, value]) => value != null && String(value).trim() !== '').map(([name]) => name)
    // The cover is never fetched for WAV, hence `hasCover` from the track itself.
    const lost = format === 'wav' && (tags.lyrics || hasCover) ? ' WAV files cannot hold a cover or lyrics.' : ''
    return `Written in: ${written.join(', ')}.${lost}`
  }

  /** Downloads one track with its tags; feedback through toasts. */
  async function download(trackId: string): Promise<void> {
    if (isDownloading(trackId)) return
    active.value = [...active.value, trackId]
    // Progress toast: shown only for slow downloads (see PROGRESS_TOAST_DELAY),
    // neutral with a spinning icon, updated with the percentage, then replaced
    // by the outcome. `progressText` keeps the latest text for when it appears.
    const progressToast = `download-${trackId}`
    let progressShown = false
    let progressText: string | undefined
    const progressTimer = setTimeout(() => {
      progressShown = true
      toast.add({
        id: progressToast,
        title: 'Preparing download…',
        description: progressText,
        icon: 'i-lucide-loader-circle',
        color: 'neutral',
        ui: { icon: 'animate-spin' },
        // No auto-close: it stays until the download ends.
        duration: 0,
      })
    }, PROGRESS_TOAST_DELAY)
    /** Ends the progress feedback: cancels a toast not yet shown, or removes it. */
    const endProgress = () => {
      clearTimeout(progressTimer)
      if (progressShown) toast.remove(progressToast)
    }

    try {
      const [track, source] = await Promise.all([tracksApi.get(trackId), tracksApi.playback(trackId)])
      const audio = await fetchBytes(source.url, (fraction) => {
        progressText = `${track.title} · ${Math.round(fraction * 100)}%`
        if (progressShown) toast.update(progressToast, { description: progressText })
      })

      const format = tagFormatOf(track.mimeType)
      // What gets saved: the tagged copy, or the file as stored.
      let file = audio
      // Second line of the success toast.
      let note: string
      if (format) {
        // WAV cannot embed a cover: skip fetching and converting it.
        const cover = format === 'wav' ? null : await coverForTags(track.coverUrl)
        const tags = tagsFromTrack(track, genreName(track.genreId), cover)
        file = writeTrackTags(audio, format, tags)
        note = describeTags(tags, format, !!track.coverUrl)
      }
      else {
        note = `${getExtension(track.audioPath).toUpperCase() || 'This'} files are saved as stored, without tags.`
      }

      saveFile(new Blob([file as Uint8Array<ArrayBuffer>], { type: track.mimeType }), downloadFileName(track))
      endProgress()
      toast.add({ title: `Downloaded ${track.title}`, description: note, icon: 'i-lucide-download', color: 'success' })
    }
    catch (err) {
      endProgress()
      toast.add({ title: 'Download failed', description: getErrorMessage(err), icon: 'i-lucide-circle-alert', color: 'error' })
    }
    finally {
      active.value = active.value.filter(id => id !== trackId)
    }
  }

  return { download, isDownloading }
}
