import { parseBlob, selectCover } from 'music-metadata'
import { computePeaks } from '~~/shared/utils/peaks'
import { resolveAudioMimeType, titleFromFileName } from '~~/shared/utils/audio-files'

/**
 * In-browser analysis of an audio file, before uploading it:
 *  - reads tags (title, artist, album, year, genre, lyrics, cover)
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
  duration: number | null
  cover: Blob | null
}

/**
 * Reads tags with music-metadata (ID3, Vorbis comments, MP4 atoms, RIFF INFO…).
 * Composers: the composer tag(s), otherwise the artist. Lyrics: unsynced
 * text, or the text of synced (SYLT) lyrics without timestamps. Years
 * outside 1000–9999 are dropped (the database would reject them).
 */
async function readTags(file: File): Promise<Tags> {
  try {
    const { common, format } = await parseBlob(file)
    const picture = selectCover(common.picture)
    const lyricsTag = common.lyrics?.[0]
    const lyrics = lyricsTag?.text ?? lyricsTag?.syncText?.map(line => line.text).join('\n') ?? null
    const composers = common.composer?.join(', ') || common.artist || null
    return {
      title: common.title?.trim() || null,
      composers,
      album: common.album?.trim() || null,
      year: common.year && common.year >= 1000 && common.year <= 9999 ? common.year : null,
      genre: common.genre?.[0]?.trim() || null,
      lyrics: lyrics?.trim() || null,
      duration: format.duration ?? null,
      cover: picture ? new Blob([picture.data as Uint8Array<ArrayBuffer>], { type: picture.format }) : null,
    }
  }
  catch {
    // Unreadable or missing tags: fall back to default values.
    return { title: null, composers: null, album: null, year: null, genre: null, lyrics: null, duration: null, cover: null }
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
