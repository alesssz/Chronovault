/**
 * A SEEKTABLE for FLAC files: the index "this sample is at this byte" that
 * lets a player jump into the middle of a track with one request.
 *
 * Why: libFLAC, driven through libflacjs with write callbacks, writes no
 * SEEKTABLE (none can be passed to the encoder, and a callback-written stream
 * cannot be rewritten afterwards to fill one). Without it a browser seeking
 * into a part not downloaded yet guesses where the frame is: a binary search
 * of range requests to the storage, about eleven for the middle of a
 * 3-minute track, one after the other, seconds on a real network.
 *
 * `addSeekTable` reads the finished file: the metadata blocks, then every
 * frame header (sync code, CRC-8, the frame or sample number it carries, in
 * sequence), and inserts a SEEKTABLE right after STREAMINFO with one point
 * every SEEK_POINT_SECONDS. The audio frames are left byte for byte as they
 * were, and a seek point's offset counts from the first frame, so it holds
 * whatever metadata comes before (tags written on download included).
 * Used by the encoder for every converted WAV.
 */

/** One seek point every this many seconds (the reference `flac` tool's default). */
export const SEEK_POINT_SECONDS = 10

/** Metadata block types used here. */
const STREAMINFO = 0
const SEEKTABLE = 3
/** Bytes per seek point: sample number (8), byte offset (8), samples in the frame (2). */
const SEEK_POINT_BYTES = 18

/** What `addSeekTable` did. */
export type SeekTableResult
  = | { status: 'added', flac: Uint8Array<ArrayBuffer>, points: number }
    | { status: 'skipped', reason: string }

/** A frame of the stream: where it starts (bytes after the first frame) and the samples it holds. */
interface FlacFrame {
  offset: number
  sample: number
  samples: number
}

/** CRC-8 of FLAC frame headers (polynomial x^8 + x^2 + x + 1), one byte at a time. */
const CRC8 = (() => {
  const table = new Uint8Array(256)
  for (let i = 0; i < 256; i++) {
    let crc = i
    for (let bit = 0; bit < 8; bit++) crc = crc & 0x80 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff
    table[i] = crc
  }
  return table
})()

/**
 * The frame header at `at`, when one really starts there: its frame number
 * (fixed block size) or first sample number (variable block size), and its
 * block size. Null when the bytes only look like a sync code: a reserved value,
 * a malformed number, or a CRC-8 that does not match.
 */
function readFrameHeader(bytes: Uint8Array, at: number): { number: number, variable: boolean, blockSize: number } | null {
  if (at + 5 > bytes.length) return null
  const variable = (bytes[at + 1]! & 0x01) === 1
  const blockCode = bytes[at + 2]! >> 4
  const rateCode = bytes[at + 2]! & 0x0f
  const channels = bytes[at + 3]! >> 4
  if (blockCode === 0 || rateCode === 0x0f || channels > 10 || (bytes[at + 3]! & 0x01) !== 0) return null

  // The frame or sample number, UTF-8-style: 1 to 7 bytes.
  let p = at + 4
  const first = bytes[p++]!
  if (first === 0xff) return null
  let length = 0
  while (length < 7 && first & (0x80 >> length)) length++
  if (length === 1 || length > 7) return null
  let number = length === 0 ? first : first & (0x7f >> length)
  for (let i = 1; i < length; i++) {
    const next = bytes[p++]
    if (next === undefined || (next & 0xc0) !== 0x80) return null
    number = number * 64 + (next & 0x3f)
  }

  // The block size, from its code or from the bytes after the number.
  let blockSize: number
  if (blockCode === 1) blockSize = 192
  else if (blockCode <= 5) blockSize = 576 << (blockCode - 2)
  else if (blockCode === 6) blockSize = bytes[p++]! + 1
  else if (blockCode === 7) {
    blockSize = ((bytes[p]! << 8) | bytes[p + 1]!) + 1
    p += 2
  }
  else blockSize = 256 << (blockCode - 8)
  // A sample rate written after the number (codes 12 to 14).
  if (rateCode === 12) p += 1
  else if (rateCode === 13 || rateCode === 14) p += 2
  if (p >= bytes.length) return null

  let crc = 0
  for (let i = at; i < p; i++) crc = CRC8[crc ^ bytes[i]!]!
  return crc === bytes[p] ? { number, variable, blockSize } : null
}

/**
 * Every frame from `firstFrame` on, in order: a header counts only when it
 * starts exactly where the previous frame's samples end, so audio bytes that
 * happen to look like a header (and pass its CRC-8) are passed over.
 */
function findFrames(bytes: Uint8Array, firstFrame: number, fixedBlockSize: number): FlacFrame[] {
  const frames: FlacFrame[] = []
  // The first sample the next frame must start with.
  let expected = 0
  for (let at = firstFrame; at < bytes.length - 1; at++) {
    if (bytes[at] !== 0xff || (bytes[at + 1]! & 0xfe) !== 0xf8) continue
    const header = readFrameHeader(bytes, at)
    if (!header) continue
    const sample = header.variable ? header.number : header.number * fixedBlockSize
    if (sample !== expected) continue
    frames.push({ offset: at - firstFrame, sample, samples: header.blockSize })
    expected = sample + header.blockSize
  }
  return frames
}

/**
 * The FLAC with a SEEKTABLE after its STREAMINFO, one point every
 * SEEK_POINT_SECONDS (each on the frame holding that moment), or why not:
 * not a FLAC (an ID3 tag in front, another format), one already there, an
 * unknown total length, or frames that do not add up to that length (the file
 * is then left as it is rather than given a wrong index).
 */
export function addSeekTable(flac: Uint8Array): SeekTableResult {
  if (flac.length < 42 || String.fromCharCode(flac[0]!, flac[1]!, flac[2]!, flac[3]!) !== 'fLaC') {
    return { status: 'skipped', reason: 'not a FLAC stream' }
  }
  const view = new DataView(flac.buffer, flac.byteOffset, flac.byteLength)

  // The metadata blocks: STREAMINFO first, and where the frames start.
  if ((flac[4]! & 0x7f) !== STREAMINFO || ((flac[5]! << 16) | (flac[6]! << 8) | flac[7]!) !== 34) {
    return { status: 'skipped', reason: 'no STREAMINFO block' }
  }
  let at = 4
  let last = false
  while (!last) {
    if (at + 4 > flac.length) return { status: 'skipped', reason: 'metadata runs past the end' }
    last = (flac[at]! & 0x80) !== 0
    if ((flac[at]! & 0x7f) === SEEKTABLE) return { status: 'skipped', reason: 'already has a seek table' }
    at += 4 + ((flac[at + 1]! << 16) | (flac[at + 2]! << 8) | flac[at + 3]!)
  }
  const firstFrame = at

  // STREAMINFO: block size, sample rate (20 bits) and total samples (36 bits).
  const info = 8
  const maxBlockSize = view.getUint16(info + 2)
  const sampleRate = (flac[info + 10]! << 12) | (flac[info + 11]! << 4) | (flac[info + 12]! >> 4)
  const totalSamples = (flac[info + 13]! & 0x0f) * 2 ** 32 + view.getUint32(info + 14)
  if (!totalSamples || !sampleRate) return { status: 'skipped', reason: 'total length unknown' }

  const frames = findFrames(flac, firstFrame, maxBlockSize)
  const end = frames.at(-1)
  if (!end || end.sample + end.samples !== totalSamples) {
    return { status: 'skipped', reason: 'frames do not add up to the stream length' }
  }

  // One point per SEEK_POINT_SECONDS: the frame holding that sample, each frame once.
  const points: FlacFrame[] = []
  const step = sampleRate * SEEK_POINT_SECONDS
  let index = 0
  for (let target = 0; target < totalSamples; target += step) {
    while (index + 1 < frames.length && frames[index + 1]!.sample <= target) index++
    if (points.at(-1) !== frames[index]) points.push(frames[index]!)
  }

  // The SEEKTABLE block; it takes over STREAMINFO's "last block" flag.
  const streamInfoLast = flac[4]! & 0x80
  const table = new Uint8Array(4 + points.length * SEEK_POINT_BYTES)
  const tableView = new DataView(table.buffer)
  table[0] = streamInfoLast | SEEKTABLE
  table[1] = (points.length * SEEK_POINT_BYTES) >> 16
  table[2] = ((points.length * SEEK_POINT_BYTES) >> 8) & 0xff
  table[3] = (points.length * SEEK_POINT_BYTES) & 0xff
  points.forEach((point, i) => {
    tableView.setBigUint64(4 + i * SEEK_POINT_BYTES, BigInt(point.sample))
    tableView.setBigUint64(12 + i * SEEK_POINT_BYTES, BigInt(point.offset))
    tableView.setUint16(20 + i * SEEK_POINT_BYTES, point.samples)
  })

  // "fLaC" and STREAMINFO (no longer last), the table, then everything else unchanged.
  const streamInfoEnd = 8 + 34
  const out = new Uint8Array(flac.length + table.length)
  out.set(flac.subarray(0, streamInfoEnd))
  out[4] = flac[4]! & 0x7f
  out.set(table, streamInfoEnd)
  out.set(flac.subarray(streamInfoEnd), streamInfoEnd + table.length)
  return { status: 'added', flac: out, points: points.length }
}
