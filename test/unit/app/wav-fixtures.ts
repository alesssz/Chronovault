/**
 * Builds WAV files byte by byte for tests: no binary fixtures in the repo,
 * and full control over format, layout and extra chunks.
 */

export interface WavFixtureOptions {
  /** Interleaved signed samples. */
  samples: Int32Array
  channels: number
  bitsPerSample: number
  sampleRate?: number
  /** 1 = PCM, 3 = IEEE float, 0xFFFE = WAVE_FORMAT_EXTENSIBLE (PCM subformat). */
  formatTag?: number
  /** Extra chunk inserted before `data` (e.g. LIST metadata). */
  extraChunk?: { id: string, body: Uint8Array }
}

function chunk(id: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + body.length + (body.length % 2))
  const view = new DataView(out.buffer)
  for (let i = 0; i < 4; i++) out[i] = id.charCodeAt(i)
  view.setUint32(4, body.length, true)
  out.set(body, 8)
  return out
}

export function buildWav(options: WavFixtureOptions): Uint8Array {
  const { samples, channels, bitsPerSample, sampleRate = 44_100, formatTag = 1, extraChunk } = options
  const bytesPerSample = bitsPerSample / 8
  const blockAlign = channels * bytesPerSample

  const extensible = formatTag === 0xFFFE
  const fmt = new Uint8Array(extensible ? 40 : 16)
  const f = new DataView(fmt.buffer)
  f.setUint16(0, formatTag, true)
  f.setUint16(2, channels, true)
  f.setUint32(4, sampleRate, true)
  f.setUint32(8, sampleRate * blockAlign, true)
  f.setUint16(12, blockAlign, true)
  f.setUint16(14, bitsPerSample, true)
  if (extensible) {
    f.setUint16(16, 22, true) // cbSize
    f.setUint16(18, bitsPerSample, true) // valid bits
    f.setUint32(20, channels === 2 ? 0x3 : 0x4, true) // channel mask
    f.setUint16(24, 1, true) // SubFormat: PCM (first 2 bytes of the GUID)
  }

  const data = new Uint8Array(samples.length * bytesPerSample)
  const d = new DataView(data.buffer)
  samples.forEach((value, i) => {
    const offset = i * bytesPerSample
    if (bitsPerSample === 8) d.setUint8(offset, value + 128)
    else if (bitsPerSample === 16) d.setInt16(offset, value, true)
    else if (bitsPerSample === 24) {
      d.setUint8(offset, value & 0xFF)
      d.setUint8(offset + 1, (value >> 8) & 0xFF)
      d.setUint8(offset + 2, (value >> 16) & 0xFF)
    }
    else if (bitsPerSample === 32 && formatTag === 3) d.setFloat32(offset, value / 2 ** 31, true)
    else d.setInt32(offset, value, true)
  })

  const parts = [chunk('fmt ', fmt), ...(extraChunk ? [chunk(extraChunk.id, extraChunk.body)] : []), chunk('data', data)]
  const bodyLength = 4 + parts.reduce((sum, p) => sum + p.length, 0)
  const out = new Uint8Array(8 + bodyLength)
  const view = new DataView(out.buffer)
  out.set([0x52, 0x49, 0x46, 0x46], 0) // RIFF
  view.setUint32(4, bodyLength, true)
  out.set([0x57, 0x41, 0x56, 0x45], 8) // WAVE
  let offset = 12
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

/**
 * Test signal: full-scale extremes first, then a mix of a sine wave and
 * deterministic noise (seeded), so every bit of the sample range is exercised.
 */
export function testSignal(frames: number, channels: number, bitsPerSample: number): Int32Array {
  const max = 2 ** (bitsPerSample - 1) - 1
  const min = -(2 ** (bitsPerSample - 1))
  const samples = new Int32Array(frames * channels)
  let seed = 12345
  const random = () => {
    seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF
    return seed / 0x7FFFFFFF
  }
  const extremes = [min, max, 0, -1, 1, min + 1, max - 1]
  for (let i = 0; i < samples.length; i++) {
    if (i < extremes.length) {
      samples[i] = extremes[i]!
      continue
    }
    const t = Math.floor(i / channels) / 44_100
    const value = Math.sin(2 * Math.PI * 440 * t) * 0.6 + (random() * 2 - 1) * 0.3
    samples[i] = Math.max(min, Math.min(max, Math.round(value * max)))
  }
  return samples
}
