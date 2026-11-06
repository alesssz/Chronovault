/**
 * The FLAC SEEKTABLE (lib/flac/seektable.ts): a converted file carries one, a point every
 * 10 seconds, each exactly on a frame start as libFLAC wrote it (recorded from its write
 * callback, not re-read); the audio frames are left byte for byte; a second decoder still
 * reads the file; files that cannot be indexed safely are left alone, with the reason.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { FLACDecoder } from '@wasm-audio-decoders/flac'
import { encodeWavToFlac, type FlacLib } from '~/lib/flac/encoder'
import { addSeekTable, SEEK_POINT_SECONDS } from '~/lib/flac/seektable'
import { parseWav } from '~/lib/flac/wav'
import { buildWav, testSignal } from './wav-fixtures'

/** libFLAC, loaded once (asm.js build: it runs in Node without WebAssembly files). */
let Flac: FlacLib

beforeAll(async () => {
  const mod = await import('libflacjs/dist/libflac.js')
  Flac = ((mod as { default?: FlacLib }).default ?? mod) as FlacLib
  if (!Flac.isReady()) await new Promise<void>(resolve => Flac.on('ready', () => resolve()))
})

/** A metadata block of a FLAC file: its type, whether it is the last one, where its body is. */
interface Block { type: number, last: boolean, start: number, length: number }

/** The metadata blocks of a FLAC file, in order, and where its frames start. */
function metadataBlocks(flac: Uint8Array): { blocks: Block[], firstFrame: number } {
  const blocks: Block[] = []
  let at = 4
  for (let last = false; !last;) {
    last = (flac[at]! & 0x80) !== 0
    const length = (flac[at + 1]! << 16) | (flac[at + 2]! << 8) | flac[at + 3]!
    blocks.push({ type: flac[at]! & 0x7f, last, start: at + 4, length })
    at += 4 + length
  }
  return { blocks, firstFrame: at }
}

/** The seek points of a FLAC's SEEKTABLE. */
function seekPoints(flac: Uint8Array): { sample: number, offset: number, samples: number }[] {
  const table = metadataBlocks(flac).blocks.find(b => b.type === 3)!
  const view = new DataView(flac.buffer, flac.byteOffset + table.start, table.length)
  return Array.from({ length: table.length / 18 }, (_, i) => ({
    sample: Number(view.getBigUint64(i * 18)),
    offset: Number(view.getBigUint64(i * 18 + 8)),
    samples: view.getUint16(i * 18 + 16),
  }))
}

/** The file without its SEEKTABLE, STREAMINFO taking back the "last block" flag: as libFLAC wrote it. */
function withoutSeekTable(flac: Uint8Array): Uint8Array {
  const table = metadataBlocks(flac).blocks.find(b => b.type === 3)!
  const out = new Uint8Array([...flac.subarray(0, table.start - 4), ...flac.subarray(table.start + table.length)])
  if (table.last) out[4] = out[4]! | 0x80
  return out
}

/** 25 seconds of 8 kHz mono noise: three seek points (0, 10, 20 s), many frames, quick to encode. */
const SECONDS = 25
const RATE = 8000
function wav25s() {
  return buildWav({ samples: testSignal(SECONDS * RATE, 1, 16), channels: 1, bitsPerSample: 16, sampleRate: RATE })
}

describe('FLAC seek table', () => {
  it('a converted FLAC carries one, a point every 10 seconds, each on a frame start libFLAC wrote', async () => {
    // Where libFLAC wrote each frame (bytes from the file's start) and its samples, from its write
    // callback: samples > 0 marks a frame, 0 metadata.
    const written: { at: number, frame: number, samples: number }[] = []
    let bytes = 0
    const recording: FlacLib = {
      ...Flac,
      init_encoder_stream: (encoder, write, metadata) =>
        Flac.init_encoder_stream(encoder, (data, numberOfBytes, samples, frame) => {
          if (samples > 0) written.push({ at: bytes, frame, samples })
          bytes += numberOfBytes
          return write(data, numberOfBytes, samples, frame)
        }, metadata),
    }
    const wav = wav25s()
    const { flac } = await encodeWavToFlac(recording, wav, parseWav(wav))

    // STREAMINFO, then the SEEKTABLE.
    const { blocks } = metadataBlocks(flac)
    expect(blocks.map(b => b.type).slice(0, 2)).toEqual([0, 3])

    // As libFLAC wrote them: the frames start right after its own metadata.
    const firstFrame = written[0]!.at
    const blockSize = written[0]!.samples
    const points = seekPoints(flac)
    expect(points).toHaveLength(Math.ceil(SECONDS / SEEK_POINT_SECONDS))
    points.forEach((point, i) => {
      // The point holds its moment (0 s, 10 s, 20 s)…
      const target = i * SEEK_POINT_SECONDS * RATE
      expect(point.sample).toBeLessThanOrEqual(target)
      expect(point.sample + point.samples).toBeGreaterThan(target)
      // …and is exactly a frame as written: its first sample, its offset from the first frame, its size.
      const frame = written.find(w => w.frame * blockSize === point.sample)!
      expect(point.offset).toBe(frame.at - firstFrame)
      expect(point.samples).toBe(frame.samples)
    })
  })

  it('leaves the audio frames byte for byte, and a second decoder reads the file', async () => {
    const wav = wav25s()
    const { flac } = await encodeWavToFlac(Flac, wav, parseWav(wav))
    // Taken out again, the table leaves exactly libFLAC's file; added again, the same table.
    const original = withoutSeekTable(flac)
    const again = addSeekTable(original)
    expect(again.status).toBe('added')
    expect(again.status === 'added' && Buffer.from(again.flac).equals(Buffer.from(flac))).toBe(true)
    // The frames after the metadata: the same bytes in both files.
    expect(Buffer.from(flac.subarray(metadataBlocks(flac).firstFrame))
      .equals(Buffer.from(original.subarray(metadataBlocks(original).firstFrame)))).toBe(true)

    // An independent decoder decodes every sample of the indexed file.
    const decoder = new FLACDecoder()
    await decoder.ready
    try {
      const { samplesDecoded, errors } = await decoder.decodeFile(flac)
      expect(errors).toEqual([])
      expect(samplesDecoded).toBe(SECONDS * RATE)
    }
    finally {
      decoder.free()
    }
  })

  it('leaves alone what it cannot index safely, and says why', async () => {
    const wav = wav25s()
    const { flac } = await encodeWavToFlac(Flac, wav, parseWav(wav))
    expect(addSeekTable(flac)).toEqual({ status: 'skipped', reason: 'already has a seek table' })
    expect(addSeekTable(new Uint8Array(wav))).toEqual({ status: 'skipped', reason: 'not a FLAC stream' })

    // A stream whose STREAMINFO announces one more sample than its frames hold.
    const original = withoutSeekTable(flac)
    const longer = original.slice()
    const view = new DataView(longer.buffer)
    view.setUint32(8 + 14, view.getUint32(8 + 14) + 1)
    expect(addSeekTable(longer)).toEqual({ status: 'skipped', reason: 'frames do not add up to the stream length' })

    // A stream cut short: its last frames are missing.
    expect(addSeekTable(original.subarray(0, original.length >> 1))).toEqual({ status: 'skipped', reason: 'frames do not add up to the stream length' })
  })
})
