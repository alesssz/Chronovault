/**
 * Lossless WAV → FLAC: WAV parsing and compatibility rules, then real libFLAC round trips
 * (8/16/24-bit, mono/stereo, full-scale extremes) decoded with a second, independent decoder,
 * the audio MD5 against Node's crypto, and detection of a corrupted stream.
 * libFLAC runs as asm.js here (the browser uses the WebAssembly build).
 */
import { createHash } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { FLACDecoder } from '@wasm-audio-decoders/flac'
import { encodeWavToFlac, FlacVerificationError, type FlacLib } from '~/lib/flac/encoder'
import { WavParseError, flacIncompatibility, isWavFile, parseWav } from '~/lib/flac/wav'
import { buildWav, testSignal } from './wav-fixtures'

let Flac: FlacLib

beforeAll(async () => {
  // Node uses the asm.js build of libFLAC (same library, no separate .wasm file to fetch).
  const mod = await import('libflacjs/dist/libflac.js')
  Flac = ((mod as { default?: FlacLib }).default ?? mod) as FlacLib
  if (!Flac.isReady()) await new Promise<void>(resolve => Flac.on('ready', () => resolve()))
})

/**
 * Decodes a FLAC with a second, independent decoder (@wasm-audio-decoders/flac)
 * and returns the samples as integers, interleaved like in the WAV.
 */
async function decodeIndependently(flac: Uint8Array, bitsPerSample: number) {
  const decoder = new FLACDecoder()
  await decoder.ready
  try {
    const { channelData, samplesDecoded, bitDepth, errors } = await decoder.decodeFile(flac)
    // This decoder outputs floats as `sample / (2^(bits-1) - 1)`. Multiplying back
    // and rounding recovers the integer: the float32 error stays below half a step.
    const scale = 2 ** (bitsPerSample - 1) - 1
    const interleaved = new Int32Array(samplesDecoded * channelData.length)
    for (let i = 0; i < samplesDecoded; i++) {
      for (let ch = 0; ch < channelData.length; ch++) {
        interleaved[i * channelData.length + ch] = Math.round(channelData[ch]![i]! * scale)
      }
    }
    return { interleaved, bitDepth, errors }
  }
  finally {
    decoder.free()
  }
}

describe('parseWav', () => {
  it('reads format and data block of a PCM WAV', () => {
    const wav = buildWav({ samples: testSignal(100, 2, 16), channels: 2, bitsPerSample: 16, sampleRate: 48_000 })
    expect(parseWav(wav)).toEqual({
      encoding: 'pcm', channels: 2, sampleRate: 48_000, bitsPerSample: 16, blockAlign: 4,
      dataOffset: 44, dataLength: 400, frames: 100,
    })
  })

  it('understands WAVE_FORMAT_EXTENSIBLE and skips extra chunks (with odd-size padding)', () => {
    const wav = buildWav({
      samples: testSignal(10, 2, 24),
      channels: 2,
      bitsPerSample: 24,
      formatTag: 0xFFFE,
      extraChunk: { id: 'LIST', body: new Uint8Array(7) },
    })
    const info = parseWav(wav)
    expect(info.encoding).toBe('pcm')
    expect(info.bitsPerSample).toBe(24)
    expect(info.frames).toBe(10)
    expect(flacIncompatibility(info)).toBeNull()
  })

  it('rejects files that are not WAV', () => {
    expect(() => parseWav(new TextEncoder().encode('ID3 not a wave file'))).toThrow(WavParseError)
  })

  it('never reads past the end of a truncated file', () => {
    const wav = buildWav({ samples: testSignal(100, 1, 16), channels: 1, bitsPerSample: 16 })
    const info = parseWav(wav.subarray(0, wav.length - 50))
    expect(info.dataLength).toBe(150)
    expect(info.frames).toBe(75)
  })

  it('recognizes WAV files by name or MIME type', () => {
    expect(isWavFile({ name: 'mix.WAV', type: '' })).toBe(true)
    expect(isWavFile({ name: 'mix', type: 'audio/x-wav' })).toBe(true)
    expect(isWavFile({ name: 'mix.flac', type: 'audio/flac' })).toBe(false)
  })
})

describe('flacIncompatibility', () => {
  it('keeps floating-point WAVs as they are', () => {
    const wav = buildWav({ samples: testSignal(10, 2, 24), channels: 2, bitsPerSample: 32, formatTag: 3 })
    expect(flacIncompatibility(parseWav(wav))).toMatch(/Floating-point/)
  })

  it('keeps 32-bit integer WAVs (beyond the bundled libFLAC)', () => {
    const wav = buildWav({ samples: testSignal(10, 2, 24), channels: 2, bitsPerSample: 32 })
    expect(flacIncompatibility(parseWav(wav))).toMatch(/32-bit/)
  })
})

describe('encodeWavToFlac', () => {
  it.each([
    { bitsPerSample: 16, channels: 2, label: '16-bit stereo (CD quality)' },
    { bitsPerSample: 24, channels: 2, label: '24-bit stereo (studio master)' },
    { bitsPerSample: 24, channels: 1, label: '24-bit mono' },
    { bitsPerSample: 8, channels: 1, label: '8-bit mono' },
  ])('$label: the FLAC decodes to exactly the original samples', async ({ bitsPerSample, channels }) => {
    const frames = 50_000
    const samples = testSignal(frames, channels, bitsPerSample)
    const wav = buildWav({ samples, channels, bitsPerSample })
    const info = parseWav(wav)

    const { flac, md5 } = await encodeWavToFlac(Flac, wav, info)

    // A real FLAC stream.
    expect(new TextDecoder().decode(flac.subarray(0, 4))).toBe('fLaC')

    // The MD5 equals the hash of the WAV audio bytes as FLAC defines them.
    const audio = Buffer.from(wav.subarray(info.dataOffset, info.dataOffset + info.dataLength))
    if (bitsPerSample === 8) audio.forEach((b, i) => (audio[i] = b ^ 0x80))
    expect(md5).toBe(createHash('md5').update(audio).digest('hex'))

    // A second, independent decoder returns the very same samples.
    const decoded = await decodeIndependently(flac, bitsPerSample)
    expect(decoded.errors).toEqual([])
    expect(decoded.bitDepth).toBe(bitsPerSample)
    expect(decoded.interleaved.length).toBe(samples.length)
    expect(Buffer.from(decoded.interleaved.buffer).equals(Buffer.from(samples.buffer))).toBe(true)
  })

  it('makes music-like audio smaller', async () => {
    const frames = 44_100 * 2
    const samples = new Int32Array(frames * 2)
    for (let i = 0; i < frames; i++) {
      const value = Math.round(Math.sin(2 * Math.PI * 220 * (i / 44_100)) * 20_000)
      samples[i * 2] = value
      samples[i * 2 + 1] = value
    }
    const wav = buildWav({ samples, channels: 2, bitsPerSample: 16 })
    const { flac } = await encodeWavToFlac(Flac, wav, parseWav(wav))
    expect(flac.byteLength).toBeLessThan(wav.byteLength / 2)
  })

  it('reports progress up to completion', async () => {
    const wav = buildWav({ samples: testSignal(100_000, 2, 16), channels: 2, bitsPerSample: 16 })
    const progress: number[] = []
    await encodeWavToFlac(Flac, wav, parseWav(wav), p => progress.push(p))
    expect(progress.at(-1)).toBe(1)
    expect(progress).toEqual([...progress].sort((a, b) => a - b))
  })

  it('refuses formats that cannot be converted losslessly', async () => {
    const wav = buildWav({ samples: testSignal(10, 2, 24), channels: 2, bitsPerSample: 32, formatTag: 3 })
    await expect(encodeWavToFlac(Flac, wav, parseWav(wav))).rejects.toBeInstanceOf(FlacVerificationError)
  })

  it('detects a corrupted FLAC stream and never returns it', async () => {
    // Flip one byte inside an audio frame written by the encoder.
    let writes = 0
    const corrupting: FlacLib = {
      ...Flac,
      init_encoder_stream: (encoder, write, metadata) =>
        Flac.init_encoder_stream(encoder, (data, numberOfBytes, samples, frame) => {
          writes++
          if (writes === 10 && numberOfBytes > 20) {
            const copy = data.slice()
            copy[numberOfBytes >> 1]! ^= 0xFF
            return write(copy, numberOfBytes, samples, frame)
          }
          return write(data, numberOfBytes, samples, frame)
        }, metadata),
    }
    const wav = buildWav({ samples: testSignal(200_000, 2, 16), channels: 2, bitsPerSample: 16 })
    await expect(encodeWavToFlac(corrupting, wav, parseWav(wav))).rejects.toBeInstanceOf(FlacVerificationError)
  })
})
