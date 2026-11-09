import type { PlaybackSource, SharedTrackContent } from '~~/shared/types/track'
import { AUDIO_EXTENSIONS, getExtension } from '~~/shared/utils/audio-files'
import { hasText } from '~~/shared/utils/text'
import { concatBytes } from '~/lib/bytes'
import { toJpeg } from '~/lib/image'
import { saveFile } from '~/lib/save-file'
import {
  downloadFileName, tagFormatOf, tagsFromTrack, type CoverImage, type TaggableTrack, type TagFormat, type TrackTags, writeTrackTags,
} from '~/lib/tags/track-tags'
import { tracksApi } from '~/services/api'
import { getErrorMessage } from '~/utils/errors'

/**
 * "Download" of a track: the stored audio file with the track's metadata
 * written into it. Two entry points share the same steps:
 *   - useTrackDownload: the owner's library and playlist menus, edit page;
 *   - useSharedTrackDownload: the public share pages (/t/:id, /p/:id), for
 *     anyone with the link of an unlisted or public track or playlist.
 *
 * Everything happens in the browser, because the file is far larger than a
 * Vercel function may return:
 *   1. track data and a fresh streaming URL (owner: from the API; share
 *      pages: the data is already on the page, only the URL is asked for)
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

/** What step 1 gathers: everything the steps after it need, whoever the visitor is. */
interface DownloadSource {
  /** The fields written as tags (title, artist, lyrics…). */
  track: TaggableTrack
  /** The genre's most specific name (the subgenre, else the genre), or null. */
  genre: string | null
  /** The cover's address (the app's /api/covers, or a signed one on share pages), or null. */
  coverUrl: string | null
  /** The stored file's type, which picks the tag system. */
  mimeType: string
  /** The stored file's extension, for the saved file's name. */
  extension: string
  /** A fresh streaming address of the file. */
  url: string
}

/** The download action for the menus and the edit page: `download(trackId)`, and `isDownloading(trackId)` for its spinner. */
export function useTrackDownload() {
  // Genre names: the owner's track only carries the genre and subgenre ids.
  const { trackGenreLabel } = useGenres()
  // The steps after the first, and the spinner state.
  const { run, isDownloading } = useDownloadSteps()

  /** Downloads one of the owner's tracks with its tags; feedback through toasts. */
  function download(trackId: string): Promise<void> {
    return run(trackId, async () => {
      // The track's full data and a fresh streaming address, together.
      const [track, source] = await Promise.all([tracksApi.get(trackId), tracksApi.playback(trackId)])
      return {
        track,
        // The most specific name, as the share pages give it: the upload reads it back to both.
        genre: trackGenreLabel(track),
        coverUrl: track.coverUrl,
        mimeType: track.mimeType,
        extension: getExtension(track.audioPath),
        url: source.url,
      }
    })
  }

  return { download, isDownloading }
}

/**
 * The download action of the share pages: `download(track)` with the track
 * as the page already has it, and `isDownloading(trackId)` for its spinner.
 * `playback` asks for the streaming address the page's own player uses
 * (the track's, or the track's through its playlist), so a download reaches
 * exactly what the visitor can already listen to, nothing more. It never
 * calls the owner's API (genres, tracks), which a visitor cannot use.
 */
export function useSharedTrackDownload(playback: (trackId: string) => Promise<PlaybackSource>) {
  // The steps after the first, and the spinner state.
  const { run, isDownloading } = useDownloadSteps()

  /** Downloads a shared track with its tags; feedback through toasts. */
  function download(track: SharedTrackContent): Promise<void> {
    return run(track.id, async () => ({
      track,
      // Shared data already carries the genre's name and a signed cover address.
      genre: track.genre,
      coverUrl: track.coverUrl,
      // The type the file was stored with, from its extension (only the extension is shared);
      // an unknown one is saved as stored.
      mimeType: AUDIO_EXTENSIONS[track.fileExtension] ?? 'application/octet-stream',
      extension: track.fileExtension,
      url: (await playback(track.id)).url,
    }))
  }

  return { download, isDownloading }
}

/**
 * Steps 2 to 5, with the progress and outcome toasts: `run(trackId, prepare)`
 * where `prepare` is step 1. Not exported: the two composables above are the
 * entry points.
 */
function useDownloadSteps() {
  // Progress and outcome of each download.
  const toast = useToast()
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
    // The stored file, streamed.
    const response = await fetch(url)
    if (!response.ok) throw new Error(`The file could not be downloaded (HTTP ${response.status})`)
    // The file size the storage announces (0 when it gives none: no percentage).
    const total = Number(response.headers.get('content-length')) || 0
    if (!response.body) return new Uint8Array(await response.arrayBuffer())

    // Reads the body piece by piece, to report progress.
    const reader = response.body.getReader()
    // Pieces as they arrive, and how many bytes so far.
    const chunks: Uint8Array[] = []
    let received = 0
    for (;;) {
      // The next piece, or the end.
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      received += value.length
      if (total) onProgress(Math.min(1, received / total))
    }
    // Join the pieces into one buffer of the real size.
    return concatBytes(chunks)
  }

  /** The track's cover as an embeddable JPEG, or null (no cover, or it could not be read). */
  async function coverForTags(coverUrl: string | null): Promise<CoverImage | null> {
    if (!coverUrl) return null
    try {
      // The cover image from its address.
      const response = await fetch(coverUrl)
      if (!response.ok) return null
      // The cover re-encoded as JPEG, the format every player shows inside tags.
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
    // WAV has no standard place for these.
    if (format !== 'wav') fields.push(['lyrics', tags.lyrics], ['synced lyrics', tags.lyricsSynced?.length ? 'yes' : null], ['cover', tags.cover])
    // The writers leave out the same empty fields (see lib/tags).
    const written = fields.filter(([, value]) => hasText(value)).map(([name]) => name)
    // The cover is never fetched for WAV, hence `hasCover` from the track itself.
    const lost = format === 'wav' && (tags.lyrics || tags.lyricsSynced?.length || hasCover) ? ' WAV files cannot hold a cover or lyrics.' : ''
    return `Written in: ${written.join(', ')}.${lost}`
  }

  /** Downloads one track with its tags (`prepare` gathers what it needs); feedback through toasts. */
  async function run(trackId: string, prepare: () => Promise<DownloadSource>): Promise<void> {
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
      // The track's data, its file's type and a fresh streaming address.
      const { track, genre, coverUrl, mimeType, extension, url } = await prepare()
      const audio = await fetchBytes(url, (fraction) => {
        progressText = `${track.title} · ${Math.round(fraction * 100)}%`
        if (progressShown) toast.update(progressToast, { description: progressText })
      })

      // The tag system for this file's format, or null (saved untagged).
      const format = tagFormatOf(mimeType)
      // What gets saved: the tagged copy, or the file as stored.
      let file = audio
      // Second line of the success toast.
      let note: string
      if (format) {
        // WAV cannot embed a cover: skip fetching and converting it.
        const cover = format === 'wav' ? null : await coverForTags(coverUrl)
        const tags = tagsFromTrack(track, genre, cover)
        file = writeTrackTags(audio, format, tags)
        note = describeTags(tags, format, !!coverUrl)
      }
      else {
        note = `${extension.toUpperCase() || 'This'} files are saved as stored, without tags.`
      }

      saveFile(new Blob([file as Uint8Array<ArrayBuffer>], { type: mimeType }), downloadFileName(track, extension))
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

  return { run, isDownloading }
}
