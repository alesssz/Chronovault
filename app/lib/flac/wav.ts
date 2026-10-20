/**
 * Minimal RIFF/WAVE parser: finds the audio format and the PCM data block.
 * It never decodes or resamples anything: the samples are read straight from
 * the file bytes, which is what makes a bit-exact FLAC conversion possible.
 */

export interface WavInfo {
  /** 'pcm' = integer samples, 'float' = IEEE floating point, 'other' = compressed/unknown. */
  encoding: 'pcm' | 'float' | 'other'
  channels: number
  sampleRate: number
  bitsPerSample: number
  /** Bytes per sample frame (all channels). */
  blockAlign: number
  /** Offset of the first audio byte inside the file. */
  dataOffset: number
  /** Length of the audio data in bytes. */
  dataLength: number
  /** Number of sample frames (samples per channel). */
  frames: number
}

export class WavParseError extends Error {
  override name = 'WavParseError'
}

const WAVE_FORMAT_PCM = 0x0001
const WAVE_FORMAT_IEEE_FLOAT = 0x0003
const WAVE_FORMAT_EXTENSIBLE = 0xFFFE

/** Highest sample rate a FLAC stream can declare (libFLAC 1.3). */
const FLAC_MAX_SAMPLE_RATE = 655_350
/** Bit depths supported by the bundled libFLAC 1.3 encoder. */
const FLAC_BIT_DEPTHS = new Set([8, 16, 24])
const FLAC_MAX_CHANNELS = 8

function fourCC(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3),
  )
}

export function parseWav(bytes: Uint8Array): WavInfo {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (bytes.byteLength < 12) throw new WavParseError('File too short to be a WAV')

  const riff = fourCC(view, 0)
  if (riff === 'RF64') throw new WavParseError('RF64 (very large) WAV files are not supported')
  if (riff !== 'RIFF' || fourCC(view, 8) !== 'WAVE') throw new WavParseError('Not a WAV file')

  let format: Omit<WavInfo, 'dataOffset' | 'dataLength' | 'frames'> | null = null
  let data: { offset: number, length: number } | null = null

  let offset = 12
  while (offset + 8 <= bytes.byteLength && (!format || !data)) {
    const id = fourCC(view, offset)
    const size = view.getUint32(offset + 4, true)
    const body = offset + 8

    if (id === 'fmt ') {
      if (size < 16 || body + 16 > bytes.byteLength) throw new WavParseError('Malformed fmt chunk')
      let formatTag = view.getUint16(body, true)
      const channels = view.getUint16(body + 2, true)
      const sampleRate = view.getUint32(body + 4, true)
      const blockAlign = view.getUint16(body + 12, true)
      const bitsPerSample = view.getUint16(body + 14, true)
      // WAVE_FORMAT_EXTENSIBLE: the real format is in the first 2 bytes of the SubFormat GUID.
      if (formatTag === WAVE_FORMAT_EXTENSIBLE && size >= 40 && body + 26 <= bytes.byteLength) {
        formatTag = view.getUint16(body + 24, true)
      }
      const encoding = formatTag === WAVE_FORMAT_PCM ? 'pcm' : formatTag === WAVE_FORMAT_IEEE_FLOAT ? 'float' : 'other'
      format = { encoding, channels, sampleRate, bitsPerSample, blockAlign }
    }
    else if (id === 'data') {
      // Some writers leave the size unset or too large: never read past the file end.
      data = { offset: body, length: Math.min(size, bytes.byteLength - body) }
    }

    // Chunks are word-aligned: odd sizes carry one padding byte.
    offset = body + size + (size % 2)
  }

  if (!format) throw new WavParseError('Missing fmt chunk')
  if (!data) throw new WavParseError('Missing data chunk')

  const frames = format.blockAlign > 0 ? Math.floor(data.length / format.blockAlign) : 0
  return { ...format, dataOffset: data.offset, dataLength: data.length, frames }
}

/**
 * Why this WAV cannot be converted to FLAC without any loss,
 * or `null` when the conversion is lossless.
 */
export function flacIncompatibility(info: WavInfo): string | null {
  if (info.encoding === 'float') return 'Floating-point WAV: FLAC can only store integer samples'
  if (info.encoding !== 'pcm') return 'Compressed or unknown WAV encoding'
  if (!FLAC_BIT_DEPTHS.has(info.bitsPerSample)) return `${info.bitsPerSample}-bit WAV is not supported by the FLAC encoder`
  if (info.channels < 1 || info.channels > FLAC_MAX_CHANNELS) return `${info.channels} channels: FLAC supports up to ${FLAC_MAX_CHANNELS}`
  if (info.sampleRate < 1 || info.sampleRate > FLAC_MAX_SAMPLE_RATE) return `Unsupported sample rate (${info.sampleRate} Hz)`
  if (info.blockAlign !== info.channels * (info.bitsPerSample / 8)) return 'Unusual sample layout'
  if (info.dataLength % info.blockAlign !== 0) return 'Incomplete last audio frame'
  if (info.frames === 0) return 'No audio data'
  return null
}

/** Reads one signed sample from WAV bytes (8-bit WAV is unsigned with a 128 offset). */
export function readWavSample(view: DataView, offset: number, bitsPerSample: number): number {
  switch (bitsPerSample) {
    case 8: return view.getUint8(offset) - 128
    case 16: return view.getInt16(offset, true)
    case 24: {
      const value = view.getUint8(offset) | (view.getUint8(offset + 1) << 8) | (view.getUint8(offset + 2) << 16)
      return (value << 8) >> 8
    }
    default: throw new RangeError(`Unsupported bit depth: ${bitsPerSample}`)
  }
}

export function isWavFile(file: { name: string, type: string }): boolean {
  return /\.wave?$/i.test(file.name) || ['audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave'].includes(file.type)
}
