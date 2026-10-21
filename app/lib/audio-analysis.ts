import { parseBlob, selectCover, TimestampFormat, type ILyricsTag } from 'music-metadata'
import { z } from 'zod'
import type { SyncedLyricLine } from '~~/shared/types/track'
import { syncedLyricLineSchema } from '~~/shared/schemas/track'
import { isSectionHeader } from '~~/shared/utils/lyrics'
import { computePeaks } from '~~/shared/utils/peaks'
import { resolveAudioMimeType, titleFromFileName } from '~~/shared/utils/audio-files'

/**
 * In-browser analysis of an audio file, before uploading it:
 *  - reads tags (title, artist, album, year, genre, lyrics and synced lyrics, cover)
 *  - computes the waveform peaks (so the server never has to process audio)
 *
 * Both run in parallel. Neither can fail the upload: missing tags fall back
 * to defaults, an undecodable file simply gets no waveform (flat placeholder).
 */

/** Everything the upload needs to know about a file; becomes the initial track metadata. */
export interface AudioAnalysis {
  mimeType: string
  title: string
  composers: string | null
  album: string | null
  year: number | null
  genre: string | null
  lyrics: string | null
  /** Synced lyrics found in the tags (SYLT frame, or LRC text in a lyrics field). */
  lyricsSynced: SyncedLyricLine[] | null
  durationSeconds: number | null
  peaks: number[] | null
  cover: Blob | null
}

/**
 * Analyzes a file the user dropped. Throws only for unsupported formats.
 * The decoded duration wins over the tag duration (tags are often wrong for
 * VBR MP3s); the title falls back to the file name.
 */
export async function analyzeAudioFile(file: File): Promise<AudioAnalysis> {
  const mimeType = resolveAudioMimeType(file)
  if (!mimeType) throw new Error('Unsupported audio format')

  const [tags, decoded] = await Promise.all([readTags(file), decodePeaks(file)])

  return {
    mimeType,
    title: tags.title ?? titleFromFileName(file.name),
    composers: tags.composers,
    album: tags.album,
    year: tags.year,
    genre: tags.genre,
    lyrics: tags.lyrics,
    lyricsSynced: tags.lyricsSynced,
    durationSeconds: decoded?.duration ?? tags.duration,
    peaks: decoded?.peaks ?? null,
    cover: tags.cover,
  }
}

/** Normalized tag values (null when absent). */
interface Tags {
  title: string | null
  composers: string | null
  album: string | null
  year: number | null
  genre: string | null
  lyrics: string | null
  lyricsSynced: SyncedLyricLine[] | null
  duration: number | null
  cover: Blob | null
}

/** Synced lines as the API accepts them (same limits as trackMetadataSchema). */
const syncedLinesSchema = z.array(syncedLyricLineSchema).min(1).max(2000)

/**
 * Plain and synced lyrics from the lyrics tags music-metadata found.
 *
 * music-metadata already turns both kinds of synced lyrics into `syncText`
 * (timestamps in ms): an ID3 SYLT frame, and LRC text in a lyrics field
 * (how FLAC files carry them, including ChronoPlayer's own downloads).
 *
 * - Synced: the first tag with millisecond timestamps. Lines such as
 *   `[Verse 1]` become section headers. Lines the API would refuse (too
 *   many, too long) drop the sync rather than fail the upload.
 * - Plain: the first tag without timestamps (keeps blank lines between
 *   stanzas), otherwise the synced lines' text.
 */
export function lyricsFromTags(tags: ILyricsTag[] | undefined): { lyrics: string | null, lyricsSynced: SyncedLyricLine[] | null } {
  const syncedTag = tags?.find(tag => tag.syncText?.length && tag.timeStampFormat === TimestampFormat.milliseconds)
  const lines = syncedTag?.syncText
    .filter(line => line.timestamp != null)
    .map(line => ({
      // Seconds, rounded to centiseconds like the sync editor.
      time: Math.round(line.timestamp! / 10) / 100,
      text: line.text.trim(),
      ...(isSectionHeader(line.text) ? { section: true } : {}),
    }))
    .sort((a, b) => a.time - b.time)
  const parsed = syncedLinesSchema.safeParse(lines)
  const lyricsSynced = parsed.success ? parsed.data : null

  const plainTag = tags?.find(tag => !tag.syncText?.length && tag.text?.trim())
  const lyrics = plainTag?.text ?? syncedTag?.syncText.map(line => line.text).join('\n') ?? null
  return { lyrics: lyrics?.trim() || null, lyricsSynced }
}

/**
 * Reads tags with music-metadata (ID3, Vorbis comments, MP4 atoms, RIFF INFO…).
 * Composers: the composer tag(s), otherwise the artist. Lyrics: see
 * lyricsFromTags. Years outside 1000–9999 are dropped (the database would
 * reject them).
 */
async function readTags(file: File): Promise<Tags> {
  try {
    const { common, format } = await parseBlob(file)
    const picture = selectCover(common.picture)
    const { lyrics, lyricsSynced } = lyricsFromTags(common.lyrics)
    const composers = common.composer?.join(', ') || common.artist || null
    return {
      title: common.title?.trim() || null,
      composers,
      album: common.album?.trim() || null,
      year: common.year && common.year >= 1000 && common.year <= 9999 ? common.year : null,
      genre: common.genre?.[0]?.trim() || null,
      lyrics,
      lyricsSynced,
      duration: format.duration ?? null,
      cover: picture ? new Blob([picture.data as Uint8Array<ArrayBuffer>], { type: picture.format }) : null,
    }
  }
  catch {
    // Unreadable or missing tags: fall back to default values.
    return { title: null, composers: null, album: null, year: null, genre: null, lyrics: null, lyricsSynced: null, duration: null, cover: null }
  }
}

/**
 * Decodes the audio at a low sample rate (enough for the waveform shape,
 * and ~5x less memory than the original 44.1 kHz).
 */
async function decodePeaks(file: File): Promise<{ peaks: number[], duration: number } | null> {
  const buffer = await file.arrayBuffer()
  // Some browsers reject very low sample rates: step up until one works.
  // `buffer.slice(0)`: decodeAudioData detaches (empties) the buffer it gets,
  // so each attempt needs its own copy.
  for (const sampleRate of [8000, 22050, 44100]) {
    try {
      // A minimal offline context: only used to decode, never to play.
      const context = new OfflineAudioContext(1, 1, sampleRate)
      const audio = await context.decodeAudioData(buffer.slice(0))
      const channels = Array.from({ length: audio.numberOfChannels }, (_, i) => audio.getChannelData(i))
      return { peaks: computePeaks(channels), duration: audio.duration }
    }
    catch {
      continue
    }
  }
  return null
}
