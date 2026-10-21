/**
 * Writes tags into an MP3 file: an ID3v2.3 tag at the start (the version
 * every player and operating system reads), through browser-id3-writer.
 *
 * The library replaces an ID3v2 tag already at the start of the file. An
 * old ID3v1 tag (the last 128 bytes, starting with "TAG") is removed here,
 * so players never show its stale values. The MPEG frames are untouched.
 */
import { ID3Writer } from 'browser-id3-writer'
import type { TrackTags } from './track-tags'

/** Size of an ID3v1 tag at the end of the file. */
const ID3V1_SIZE = 128

/** The file without a trailing ID3v1 tag (unchanged when there is none). */
function withoutId3v1(file: Uint8Array): Uint8Array {
  const start = file.length - ID3V1_SIZE
  const hasV1 = start >= 0 && file[start] === 0x54 && file[start + 1] === 0x41 && file[start + 2] === 0x47 // "TAG"
  return hasV1 ? file.subarray(0, start) : file
}

/** A copy of the MP3 with `tags` written in; empty fields are left out. */
export function writeMp3Tags(file: Uint8Array, tags: TrackTags): Uint8Array {
  // The writer works on an ArrayBuffer of exactly the file (no surrounding bytes).
  const source = withoutId3v1(file).slice()
  // Collects the frames, then builds tag + file in addTag().
  const writer = new ID3Writer(source.buffer)

  // Text frames (ID3v2.3 names): title, artist, composer, album, year, genre.
  writer.setFrame('TIT2', tags.title)
  if (tags.artist) {
    writer.setFrame('TPE1', [tags.artist])
    writer.setFrame('TCOM', [tags.artist])
  }
  if (tags.album) writer.setFrame('TALB', tags.album)
  if (tags.year) writer.setFrame('TYER', tags.year)
  if (tags.genre) writer.setFrame('TCON', [tags.genre])
  // Comment and unsynchronised lyrics carry a language code; ours is English text by default.
  if (tags.comment) writer.setFrame('COMM', { description: '', text: tags.comment, language: 'eng' })
  if (tags.lyrics) writer.setFrame('USLT', { description: '', lyrics: tags.lyrics, language: 'eng' })
  // Picture type 3 = front cover.
  if (tags.cover) writer.setFrame('APIC', { type: 3, data: tags.cover.data.slice().buffer, description: 'Cover' })

  return new Uint8Array(writer.addTag())
}
