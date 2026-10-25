/**
 * Writes tags into a FLAC file: Vorbis comments and a front-cover PICTURE.
 *
 * A FLAC file is `fLaC`, then a chain of metadata blocks, then the audio
 * frames. Each block has a 4-byte header:
 *
 *   bit 7      last-block flag (1 on the final metadata block)
 *   bits 0-6   block type: 0 STREAMINFO, 1 PADDING, 2 APPLICATION,
 *              3 SEEKTABLE, 4 VORBIS_COMMENT, 5 CUESHEET, 6 PICTURE
 *   24 bits    length of the block body (big-endian)
 *
 * Writing tags means rebuilding only that chain: existing VORBIS_COMMENT,
 * PICTURE and PADDING blocks are dropped, the others kept in their order
 * (STREAMINFO always first), then new comment and picture blocks and some
 * padding are appended. The audio frames are copied untouched.
 *
 * Spec: https://xiph.org/flac/format.html
 */
import { serializeLrc } from '~~/shared/utils/lyrics'
import { asciiAt, concatBytes } from '../bytes'
import { hasText } from '~~/shared/utils/text'
import type { TrackTags } from './track-tags'
import { APP_NAME } from '~~/shared/brand'

/** Metadata block types used here (see the header above). */
const BLOCK = { STREAMINFO: 0, PADDING: 1, VORBIS_COMMENT: 4, PICTURE: 6 } as const

/** Free space left after the tags, so a tag editor can change them later without rewriting the file. */
const PADDING_BYTES = 4096

/** Largest block body the 24-bit length field can describe. */
const MAX_BLOCK_LENGTH = 0xFFFFFF

/** Written as the Vorbis "vendor string" (the tool that wrote the comments): the app's name. */
const VENDOR = APP_NAME

/** A metadata block as it sits in the file: type + body (the header is rebuilt on write). */
interface Block {
  /** The block type (see BLOCK). */
  type: number
  /** The block's body, without its 4-byte header. */
  body: Uint8Array
}

/** Text → UTF-8 bytes (Vorbis comments and descriptions are UTF-8). */
const utf8 = new TextEncoder()

/** Size of an ID3v2 tag at the start of the file (some tools put one before `fLaC`), 0 if none. */
function leadingId3Size(file: Uint8Array): number {
  if (file.length < 10 || file[0] !== 0x49 || file[1] !== 0x44 || file[2] !== 0x33) return 0 // "ID3"
  // The size is "synchsafe": 4 bytes of 7 bits each, plus the 10-byte header.
  return ((file[6]! << 21) | (file[7]! << 14) | (file[8]! << 7) | file[9]!) + 10
}

/**
 * Splits a FLAC file into its metadata blocks and the offset where the audio
 * frames start. Throws on anything that is not a well-formed FLAC.
 */
export function readFlacBlocks(file: Uint8Array): { blocks: Block[], audioOffset: number } {
  // Read position: past a leading ID3 tag, if any.
  let offset = leadingId3Size(file)
  const magic = asciiAt(file, offset)
  if (magic !== 'fLaC') throw new Error('Not a FLAC file')
  offset += 4

  // The metadata blocks, in file order.
  const blocks: Block[] = []
  for (;;) {
    if (offset + 4 > file.length) throw new Error('Truncated FLAC metadata')
    // The first byte of the block's header.
    const header = file[offset]!
    // Header byte: last-block flag (bit 7) and block type (bits 0-6), then a 24-bit length.
    const isLast = (header & 0x80) !== 0
    const type = header & 0x7F
    // Body length, big-endian over 3 bytes.
    const length = (file[offset + 1]! << 16) | (file[offset + 2]! << 8) | file[offset + 3]!
    const bodyStart = offset + 4
    if (bodyStart + length > file.length) throw new Error('Truncated FLAC metadata')
    blocks.push({ type, body: file.subarray(bodyStart, bodyStart + length) })
    offset = bodyStart + length
    if (isLast) break
  }
  if (blocks[0]?.type !== BLOCK.STREAMINFO) throw new Error('FLAC without STREAMINFO')
  return { blocks, audioOffset: offset }
}

/** Little-endian 32-bit integer (Vorbis comments use little-endian lengths). */
function u32le(value: number): Uint8Array {
  // Four bytes, written through a DataView.
  const out = new Uint8Array(4)
  new DataView(out.buffer).setUint32(0, value, true)
  return out
}

/** Big-endian 32-bit integer (the PICTURE block uses big-endian fields). */
function u32be(value: number): Uint8Array {
  // Four bytes, written through a DataView.
  const out = new Uint8Array(4)
  new DataView(out.buffer).setUint32(0, value, false)
  return out
}

/**
 * VORBIS_COMMENT body: vendor string, then `FIELD=value` entries (UTF-8,
 * each preceded by its length). Field names follow the common conventions
 * that players and music-metadata understand.
 *
 * Lyrics: with synced lyrics, LYRICS holds them as LRC text (the de facto
 * convention: players that support it show them in sync, and music-metadata
 * reads the timestamps back) and UNSYNCEDLYRICS keeps the plain text with
 * its blank lines. Without synced lyrics, LYRICS is the plain text.
 */
function vorbisCommentBlock(tags: TrackTags): Uint8Array {
  // The synced lyrics as LRC text, or null without them.
  const synced = tags.lyricsSynced?.length ? serializeLrc(tags.lyricsSynced) : null
  // Vorbis field name → value; empty values are dropped below.
  const fields: [string, string | number | null][] = [
    ['TITLE', tags.title],
    ['ARTIST', tags.artist],
    ['COMPOSER', tags.artist],
    ['ALBUM', tags.album],
    ['DATE', tags.year],
    ['GENRE', tags.genre],
    ['COMMENT', tags.comment],
    ['LYRICS', synced ?? tags.lyrics],
    ['UNSYNCEDLYRICS', synced ? tags.lyrics : null],
  ]
  // Each non-empty field as one `NAME=value` comment, UTF-8.
  const entries = fields
    .filter(([, value]) => hasText(value))
    .map(([name, value]) => utf8.encode(`${name}=${value}`))
  // The vendor string, UTF-8.
  const vendor = utf8.encode(VENDOR)
  return concatBytes([
    u32le(vendor.length), vendor,
    u32le(entries.length),
    ...entries.flatMap(entry => [u32le(entry.length), entry]),
  ])
}

/** PICTURE body for the front cover (picture type 3), with its size and a 24-bit colour depth. */
function pictureBlock(cover: NonNullable<TrackTags['cover']>): Uint8Array {
  // The image's MIME type and the picture's description, UTF-8.
  const mime = utf8.encode(cover.mimeType)
  const description = utf8.encode('Cover')
  return concatBytes([
    u32be(3), // picture type: front cover
    u32be(mime.length), mime,
    u32be(description.length), description,
    u32be(cover.width),
    u32be(cover.height),
    u32be(24), // colour depth (bits per pixel)
    u32be(0), // indexed colours: 0 for non-palette images
    u32be(cover.data.length), cover.data,
  ])
}

/** A block with its 4-byte header. */
function encodeBlock(block: Block, isLast: boolean): Uint8Array {
  if (block.body.length > MAX_BLOCK_LENGTH) throw new Error('FLAC metadata block too large')
  // Flag + type, then the 24-bit body length (big-endian).
  const header = new Uint8Array([
    (isLast ? 0x80 : 0) | block.type,
    (block.body.length >> 16) & 0xFF,
    (block.body.length >> 8) & 0xFF,
    block.body.length & 0xFF,
  ])
  return concatBytes([header, block.body])
}

/**
 * A copy of the FLAC with `tags` written in. Existing comments, pictures and
 * padding are replaced (and a leading ID3 tag dropped); every other block
 * and all audio frames are kept as they are.
 */
export function writeFlacTags(file: Uint8Array, tags: TrackTags): Uint8Array {
  // The file's metadata blocks, and where the audio frames start.
  const { blocks, audioOffset } = readFlacBlocks(file)
  // Every block but the ones rewritten here (STREAMINFO, SEEKTABLE… stay as they are).
  const kept = blocks.filter(b => b.type !== BLOCK.VORBIS_COMMENT && b.type !== BLOCK.PICTURE && b.type !== BLOCK.PADDING)
  // New chain: kept blocks (STREAMINFO first), then comments, cover and padding.
  const chain: Block[] = [
    ...kept,
    { type: BLOCK.VORBIS_COMMENT, body: vorbisCommentBlock(tags) },
    ...(tags.cover ? [{ type: BLOCK.PICTURE, body: pictureBlock(tags.cover) }] : []),
    { type: BLOCK.PADDING, body: new Uint8Array(PADDING_BYTES) },
  ]
  return concatBytes([
    utf8.encode('fLaC'),
    ...chain.map((block, i) => encodeBlock(block, i === chain.length - 1)),
    file.subarray(audioOffset),
  ])
}
