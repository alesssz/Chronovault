/**
 * Metadata written into downloaded audio files ("Download" in the track
 * menus and on the edit page).
 *
 * The library keeps metadata in the database, not inside the files: a file
 * fetched straight from storage has no title, cover or lyrics. On download
 * the browser writes them into the file, in the format's own tag system:
 *
 *   FLAC → Vorbis comments + PICTURE block   (flac-tags.ts)
 *   MP3  → ID3v2.3                           (id3-tags.ts)
 *   WAV  → RIFF LIST/INFO (text fields only) (wav-tags.ts)
 *
 * Synced lyrics travel too (FLAC: LRC text in LYRICS; MP3: an SYLT frame),
 * and the upload reads them back (lib/audio-analysis.ts): downloading a
 * track from one ChronoPlayer and uploading it to another carries the sync.
 *
 * Other formats (OGG/Opus, M4A/AAC, WebM) are downloaded as stored. Only the
 * tags change: the audio data is copied byte for byte. The Suno prompt and
 * the mastering status are personal notes and are never written.
 */
import type { SyncedLyricLine, TrackDetail } from '~~/shared/types/track'
import { WAV_MIME_TYPES, getExtension } from '~~/shared/utils/audio-files'
import { writeFlacTags } from './flac-tags'
import { writeMp3Tags } from './id3-tags'
import { writeWavTags } from './wav-tags'

/** A cover ready to embed: always JPEG (the most widely supported picture format in tags). */
export interface CoverImage {
  data: Uint8Array
  mimeType: 'image/jpeg'
  width: number
  height: number
}

/** What gets written; empty fields are simply left out of the file. */
export interface TrackTags {
  title: string
  /** The track's "Composers / Authors", written as both artist and composer. */
  artist: string | null
  album: string | null
  year: number | null
  genre: string | null
  /** The track description, written as the comment. */
  comment: string | null
  /** Plain lyrics, section headers included. */
  lyrics: string | null
  /** Synced lyrics (headers included), sorted by time; null or empty = none. */
  lyricsSynced: SyncedLyricLine[] | null
  cover: CoverImage | null
}

/** Tag systems the app can write. */
export type TagFormat = 'flac' | 'mp3' | 'wav'

/** Which tag system a stored file uses, from its MIME type; null = cannot be tagged. */
export function tagFormatOf(mimeType: string): TagFormat | null {
  const type = mimeType.toLowerCase()
  if (type === 'audio/flac' || type === 'audio/x-flac') return 'flac'
  if (type === 'audio/mpeg' || type === 'audio/mp3') return 'mp3'
  if (WAV_MIME_TYPES.includes(type)) return 'wav'
  return null
}

/** The tags of a track (genre given by name: the track only has its id). */
export function tagsFromTrack(track: TrackDetail, genre: string | null, cover: CoverImage | null): TrackTags {
  return {
    title: track.title,
    artist: track.composers,
    album: track.album,
    year: track.year,
    genre,
    comment: track.description,
    lyrics: track.lyrics,
    lyricsSynced: track.lyricsSynced,
    cover,
  }
}

/**
 * Writes the tags into a copy of the file. Any tags already in the file are
 * replaced; the audio is untouched. Throws when the file is not a valid
 * file of that format.
 */
export function writeTrackTags(file: Uint8Array, format: TagFormat, tags: TrackTags): Uint8Array {
  switch (format) {
    case 'flac': return writeFlacTags(file, tags)
    case 'mp3': return writeMp3Tags(file, tags)
    case 'wav': return writeWavTags(file, tags)
  }
}

/** Characters Windows, macOS or Linux refuse in file names, plus control characters. */
// eslint-disable-next-line no-control-regex
const UNSAFE_FILE_CHARS = /[<>:"/\\|?*\u0000-\u001F]/g

/**
 * Name of the downloaded file: "Composers - Title.ext" (or "Title.ext"),
 * with characters that file systems refuse replaced, at most 150 characters
 * before the extension. The extension is the stored file's.
 */
export function downloadFileName(track: Pick<TrackDetail, 'title' | 'composers' | 'audioPath'>): string {
  return `${safeBaseName(track)}.${getExtension(track.audioPath) || 'audio'}`
}

/** Name of an exported LRC file: "Composers - Title.lrc", like the audio download. */
export function lrcFileName(track: Pick<TrackDetail, 'title' | 'composers'>): string {
  return `${safeBaseName(track)}.lrc`
}

/** "Composers - Title" (or "Title") made safe for every file system; "track" if nothing is left. */
function safeBaseName(track: Pick<TrackDetail, 'title' | 'composers'>): string {
  // "Composers - Title", or just the title.
  const base = [track.composers, track.title].filter(Boolean).join(' - ')
  const safe = base
    .replace(UNSAFE_FILE_CHARS, '_')
    .replace(/\s+/g, ' ')
    // Cut first, then clean the end: the cut itself may leave a space or a dot there.
    .slice(0, 150)
    .trim()
    // Windows refuses names ending with a dot or a space.
    .replace(/[. ]+$/, '')
  return safe || 'track'
}
