import type * as LibFlac from 'libflacjs/dist/index'
import { createMD5 } from 'hash-wasm'
import { flacIncompatibility, readWavSample, type WavInfo } from './wav'

/**
 * Lossless WAV → FLAC conversion with libFLAC (the reference implementation),
 * followed by a verification chain that proves the result is bit-identical:
 *
 *  1. libFLAC "verify" mode: every encoded frame is decoded on the fly and
 *     compared with the input inside the encoder itself.
 *  2. MD5 of the original WAV audio bytes === MD5 stored by libFLAC in the
 *     FLAC header (STREAMINFO). This check does not depend on our own sample
 *     parsing: it proves the encoder received exactly the samples of the file.
 *  3. The whole FLAC is decoded again with MD5 checking enabled, and every
 *     decoded sample is compared with the original one.
 *
 * Any mismatch throws `FlacVerificationError`: callers must then keep the
 * original WAV. A FLAC is only ever returned when all checks pass.
 */

export type FlacLib = typeof LibFlac

export class FlacVerificationError extends Error {
  override name = 'FlacVerificationError'
}

export interface FlacEncodeResult {
  flac: Uint8Array<ArrayBuffer>
  /** MD5 of the audio samples (identical for the WAV and the FLAC). */
  md5: string
}

/** libFLAC compression level: 5 is the reference default (size/speed balance). */
const COMPRESSION_LEVEL = 5
/** Sample frames handed to the encoder per call. */
const CHUNK_FRAMES = 32_768
const STATUS_OK = 0

export async function encodeWavToFlac(
  Flac: FlacLib,
  wav: Uint8Array,
  info: WavInfo,
  onProgress?: (fraction: number) => void,
): Promise<FlacEncodeResult> {
  const reason = flacIncompatibility(info)
  if (reason) throw new FlacVerificationError(reason)

  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength)
  const { channels, sampleRate, bitsPerSample, blockAlign, dataOffset, dataLength, frames } = info
  const bytesPerSample = bitsPerSample / 8

  const sourceMd5 = await md5OfWavAudio(wav.subarray(dataOffset, dataOffset + dataLength), bitsPerSample)

  // --- 1. Encode (with libFLAC verify mode) ------------------------------------------
  const output: Uint8Array[] = []
  let outputLength = 0
  let streamMd5: string | null = null

  const encoder = Flac.create_libflac_encoder(sampleRate, channels, bitsPerSample, COMPRESSION_LEVEL, frames, true)
  if (!encoder) throw new FlacVerificationError('Could not create the FLAC encoder')

  try {
    const status = Flac.init_encoder_stream(
      encoder,
      (data, numberOfBytes) => {
        output.push(data.slice(0, numberOfBytes))
        outputLength += numberOfBytes
      },
      (metadata) => {
        if (metadata?.md5sum) streamMd5 = metadata.md5sum
      },
    )
    if (status !== STATUS_OK) throw new FlacVerificationError(`FLAC encoder initialization failed (${status})`)

    const chunk = new Int32Array(CHUNK_FRAMES * channels)
    for (let frame = 0; frame < frames; frame += CHUNK_FRAMES) {
      const count = Math.min(CHUNK_FRAMES, frames - frame)
      let byte = dataOffset + frame * blockAlign
      for (let i = 0; i < count * channels; i++, byte += bytesPerSample) {
        chunk[i] = readWavSample(view, byte, bitsPerSample)
      }
      if (!Flac.FLAC__stream_encoder_process_interleaved(encoder, chunk.subarray(0, count * channels), count)) {
        throw new FlacVerificationError(`FLAC encoding failed (encoder state ${Flac.FLAC__stream_encoder_get_state(encoder)})`)
      }
      onProgress?.(0.5 * ((frame + count) / frames))
    }

    if (!Flac.FLAC__stream_encoder_finish(encoder)) {
      throw new FlacVerificationError(`FLAC encoder verification failed (encoder state ${Flac.FLAC__stream_encoder_get_state(encoder)})`)
    }
  }
  finally {
    Flac.FLAC__stream_encoder_delete(encoder)
  }

  const flac = concat(output, outputLength)

  // --- 2. Source MD5 === MD5 stored in the FLAC ----------------------------------------
  if (streamMd5 !== sourceMd5) {
    throw new FlacVerificationError('MD5 mismatch between the WAV audio and the FLAC stream')
  }

  // --- 3. Full decode: MD5 check + sample-by-sample comparison ------------------------
  verifyByDecoding(Flac, flac, view, info, fraction => onProgress?.(0.5 + 0.5 * fraction))

  onProgress?.(1)
  return { flac, md5: sourceMd5 }
}

function verifyByDecoding(
  Flac: FlacLib,
  flac: Uint8Array<ArrayBuffer>,
  source: DataView,
  info: WavInfo,
  onProgress: (fraction: number) => void,
): void {
  const { bitsPerSample, blockAlign, dataOffset, frames } = info
  const bytesPerSample = bitsPerSample / 8
  // libflacjs hands decoded samples as little-endian int16 (≤ 16 bit) or int32 (24 bit).
  const decodedBytes = bitsPerSample <= 16 ? 2 : 4

  let readOffset = 0
  let decodedFrames = 0
  let failure: string | null = null

  const decoder = Flac.create_libflac_decoder(true)
  if (!decoder) throw new FlacVerificationError('Could not create the FLAC decoder')

  try {
    Flac.FLAC__stream_decoder_set_md5_checking(decoder, true)
    const status = Flac.init_decoder_stream(
      decoder,
      (numberOfBytes) => {
        const end = Math.min(readOffset + numberOfBytes, flac.byteLength)
        const buffer = flac.subarray(readOffset, end)
        readOffset = end
        return { buffer, readDataLength: buffer.byteLength, error: false }
      },
      (channelData, frameInfo) => {
        if (failure) return false
        const blockSize = frameInfo.blocksize
        if (decodedFrames + blockSize > frames || channelData.length !== info.channels) {
          failure = 'Decoded stream does not match the WAV layout'
          return false
        }
        for (let ch = 0; ch < channelData.length; ch++) {
          const data = channelData[ch]!
          const decoded = new DataView(data.buffer, data.byteOffset, data.byteLength)
          for (let i = 0; i < blockSize; i++) {
            const value = decodedBytes === 2 ? decoded.getInt16(i * 2, true) : decoded.getInt32(i * 4, true)
            const expected = readWavSample(source, dataOffset + (decodedFrames + i) * blockAlign + ch * bytesPerSample, bitsPerSample)
            if (value !== expected) {
              failure = `Sample mismatch at frame ${decodedFrames + i}, channel ${ch}`
              return false
            }
          }
        }
        decodedFrames += blockSize
        onProgress(decodedFrames / frames)
      },
      (_code, description) => {
        failure ??= `FLAC decoding error: ${description}`
      },
    )
    if (status !== STATUS_OK) throw new FlacVerificationError(`FLAC decoder initialization failed (${status})`)

    const decodedAll = Flac.FLAC__stream_decoder_process_until_end_of_stream(decoder)
    // With MD5 checking enabled, finish() returns false when the decoded audio
    // does not match the MD5 stored in the stream.
    const md5Ok = Flac.FLAC__stream_decoder_finish(decoder)

    if (failure) throw new FlacVerificationError(failure)
    if (!decodedAll) throw new FlacVerificationError('The FLAC stream could not be fully decoded')
    if (!md5Ok) throw new FlacVerificationError('Decoded audio does not match the MD5 stored in the FLAC')
    if (decodedFrames !== frames) throw new FlacVerificationError(`Decoded ${decodedFrames} of ${frames} sample frames`)
  }
  finally {
    Flac.FLAC__stream_decoder_delete(decoder)
  }
}

/**
 * MD5 of the audio exactly as FLAC defines it: signed little-endian samples.
 * WAV stores 16/24-bit audio the same way, so the hash is computed on the raw
 * file bytes; 8-bit WAV is unsigned, so its bytes are shifted by 128 first.
 */
async function md5OfWavAudio(audio: Uint8Array, bitsPerSample: number): Promise<string> {
  const md5 = await createMD5()
  md5.init()
  const block = 4 << 20
  for (let i = 0; i < audio.byteLength; i += block) {
    if (bitsPerSample === 8) {
      const signed = audio.slice(i, i + block)
      for (let j = 0; j < signed.length; j++) signed[j]! ^= 0x80
      md5.update(signed)
    }
    else {
      md5.update(audio.subarray(i, i + block))
    }
  }
  return md5.digest('hex')
}

function concat(parts: Uint8Array[], length: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(length)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.byteLength
  }
  return out
}
