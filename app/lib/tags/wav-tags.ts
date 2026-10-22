/**
 * Writes tags into a WAV file: a RIFF `LIST` chunk of type `INFO`, the
 * standard text tags of WAV files (title, artist, album, year, genre,
 * comment). WAV has no standard place for a cover or lyrics, so those are
 * not written.
 *
 * Only WAV files that could not become FLAC are stored as WAV (e.g. 32-bit
 * float masters), so this is rarely used.
 *
 * INFO strings are Latin-1 (ISO 8859-1) unless the file declares another
 * code page, which few players support: Western European letters (à, è, ö…)
 * are kept, other characters become "?".
 *
 * A RIFF file is "RIFF" <size> "WAVE" followed by chunks (<id> <size> <body>,
 * padded to an even length). Any existing LIST/INFO chunk is replaced; every
 * other chunk, the audio data included, is copied as is.
 */
import { asciiAt, concatBytes } from '../bytes'
import { hasText } from '~~/shared/utils/text'
import type { TrackTags } from './track-tags'

/** One chunk of the file, as found: id and the bytes of its body. */
interface Chunk {
  id: string
  body: Uint8Array
}

/** Splits a WAV file into its chunks. Throws when it is not a RIFF/WAVE file. */
export function readWavChunks(file: Uint8Array): Chunk[] {
  if (file.length < 12 || asciiAt(file, 0) !== 'RIFF' || asciiAt(file, 8) !== 'WAVE') {
    throw new Error('Not a WAV file')
  }
  // Little-endian reads of the chunk sizes.
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength)
  // Chunks in file order, after the 12-byte RIFF header.
  const chunks: Chunk[] = []
  let offset = 12
  while (offset + 8 <= file.length) {
    const id = asciiAt(file, offset)
    // Some writers put a too large size on the last chunk: never read past the end.
    const size = Math.min(view.getUint32(offset + 4, true), file.length - offset - 8)
    chunks.push({ id, body: file.subarray(offset + 8, offset + 8 + size) })
    // Chunks are word-aligned: an odd size is followed by one padding byte.
    offset += 8 + size + (size % 2)
  }
  return chunks
}

/** True for a `LIST` chunk whose list type is `INFO` (other LIST types, e.g. `adtl`, are kept). */
function isInfoList(chunk: Chunk): boolean {
  return chunk.id === 'LIST' && asciiAt(chunk.body, 0) === 'INFO'
}

/** Latin-1 bytes of `text`, with "?" for characters outside Latin-1. */
function latin1(text: string): Uint8Array {
  return Uint8Array.from(Array.from(text, ch => (ch.codePointAt(0)! <= 0xFF ? ch.codePointAt(0)! : 0x3F)))
}

/** One chunk with its header and padding byte. */
function encodeChunk(id: string, body: Uint8Array): Uint8Array {
  // Id (4) + size (4) + body + padding byte for odd sizes (left at 0).
  const out = new Uint8Array(8 + body.length + (body.length % 2))
  out.set(latin1(id), 0)
  new DataView(out.buffer).setUint32(4, body.length, true)
  out.set(body, 8)
  return out
}

/**
 * The INFO list: one sub-chunk per non-empty field, each a NUL-terminated
 * string (the terminator is part of the value, as the format expects).
 */
function infoList(tags: TrackTags): Uint8Array {
  // INFO id → value; empty values are dropped below.
  const fields: [string, string | number | null][] = [
    ['INAM', tags.title], // name (title)
    ['IART', tags.artist], // artist
    ['IPRD', tags.album], // product (album)
    ['ICRD', tags.year], // creation date (year)
    ['IGNR', tags.genre], // genre
    ['ICMT', tags.comment], // comment
  ]
  const subChunks = fields
    .filter(([, value]) => hasText(value))
    .map(([id, value]) => encodeChunk(id, Uint8Array.from([...latin1(String(value)), 0])))
  return concatBytes([latin1('INFO'), ...subChunks])
}

/**
 * A copy of the WAV with `tags` written in: the new INFO list goes right
 * before the `data` chunk (where readers that stop at the audio still find
 * it), replacing any previous one.
 */
export function writeWavTags(file: Uint8Array, tags: TrackTags): Uint8Array {
  const chunks = readWavChunks(file).filter(chunk => !isInfoList(chunk))
  const info = encodeChunk('LIST', infoList(tags))
  // Every chunk re-encoded, with the INFO list slotted in before `data`.
  const encoded: Uint8Array[] = []
  for (const chunk of chunks) {
    if (chunk.id === 'data') encoded.push(info)
    encoded.push(encodeChunk(chunk.id, chunk.body))
  }
  // No data chunk found (unusual): append the tags at the end.
  if (!chunks.some(chunk => chunk.id === 'data')) encoded.push(info)

  const body = concatBytes([latin1('WAVE'), ...encoded])
  // "RIFF" + total size of what follows.
  const header = new Uint8Array(8)
  header.set(latin1('RIFF'), 0)
  // RIFF size: everything after the 8-byte RIFF header.
  new DataView(header.buffer).setUint32(4, body.length, true)
  return concatBytes([header, body])
}
