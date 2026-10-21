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

/** The libflacjs API (loaded as WebAssembly in the worker, as asm.js in Node tests). */
export type FlacLib = typeof LibFlac

/** Any encoding or verification failure: the caller must keep the original WAV. */
export class FlacVerificationError extends Error {
  override name = 'FlacVerificationError'
}

/** A verified FLAC, ready to upload. */
export interface FlacEncodeResult {
  flac: Uint8Array<ArrayBuffer>
  /** MD5 of the audio samples (identical for the WAV and the FLAC). */
  md5: string
}

/** libFLAC compression level: 5 is the reference default (size/speed balance). */
const COMPRESSION_LEVEL = 5
/** Sample frames handed to the encoder per call (bounds memory: 32k frames × channels × 4 bytes). */
const CHUNK_FRAMES = 32_768
/** libFLAC init status code for success (FLAC__STREAM_ENCODER_INIT_STATUS_OK / decoder equivalent). */
const STATUS_OK = 0

/**
 * Encodes the WAV's PCM data to FLAC and runs the three verification steps.
 * Progress: 0..0.5 while encoding, 0.5..1 while decoding back.
 */
export async function encodeWavToFlac(
  Flac: FlacLib,
  wav: Uint8Array,
  info: WavInfo,
  onProgress?: (fraction: number) => void,
): Promise<FlacEncodeResult> {
  const reason = flacIncompatibility(info)
  if (reason) throw new FlacVerificationError(reason)

  // Samples are read straight from the WAV bytes through this view.
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength)
  const { channels, sampleRate, bitsPerSample, blockAlign, dataOffset, dataLength, frames } = info
  const bytesPerSample = bitsPerSample / 8

  const sourceMd5 = await md5OfWavAudio(wav.subarray(dataOffset, dataOffset + dataLength), bitsPerSample)

  // --- 1. Encode (with libFLAC verify mode) ------------------------------------------
  const output: Uint8Array[] = []
  // Total bytes written by the encoder, to join the chunks at the end.
  let outputLength = 0
  // MD5 libFLAC writes in STREAMINFO, compared with our own MD5 (check 2).
  let streamMd5: string | null = null

  // Last argument `true` = verify mode (step 1). `frames` lets libFLAC write the exact total in STREAMINFO.
  const encoder = Flac.create_libflac_encoder(sampleRate, channels, bitsPerSample, COMPRESSION_LEVEL, frames, true)
  if (!encoder) throw new FlacVerificationError('Could not create the FLAC encoder')

  try {
    const status = Flac.init_encoder_stream(
      encoder,
      // Write callback: libFLAC reuses its buffer, so copy every chunk.
      (data, numberOfBytes) => {
        output.push(data.slice(0, numberOfBytes))
        outputLength += numberOfBytes
      },
      // Metadata callback: STREAMINFO arrives at the end, with the MD5 of the encoded audio.
      (metadata) => {
        if (metadata?.md5sum) streamMd5 = metadata.md5sum
      },
    )
    if (status !== STATUS_OK) throw new FlacVerificationError(`FLAC encoder initialization failed (${status})`)

    // Interleaved samples (L R L R…), read straight from the WAV bytes: no decoding, no resampling.
    const chunk = new Int32Array(CHUNK_FRAMES * channels)
    for (let frame = 0; frame < frames; frame += CHUNK_FRAMES) {
      const count = Math.min(CHUNK_FRAMES, frames - frame)
      // Byte offset of the first sample of this chunk in the WAV.
      let byte = dataOffset + frame * blockAlign
      for (let i = 0; i < count * channels; i++, byte += bytesPerSample) {
        chunk[i] = readWavSample(view, byte, bitsPerSample)
      }
      if (!Flac.FLAC__stream_encoder_process_interleaved(encoder, chunk.subarray(0, count * channels), count)) {
        throw new FlacVerificationError(`FLAC encoding failed (encoder state ${Flac.FLAC__stream_encoder_get_state(encoder)})`)
      }
      onProgress?.(0.5 * ((frame + count) / frames))
    }

    // finish() flushes the last frame; in verify mode it fails if any frame did not decode back identically.
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

/**
 * Step 3: decodes the whole FLAC (libFLAC's own MD5 check enabled) and
 * compares every decoded sample with the WAV. Throws on the first mismatch.
 */
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

  // How much of the FLAC the decoder has consumed.
  let readOffset = 0
  // Sample frames decoded and compared so far.
  let decodedFrames = 0
  // First mismatch or decoder error; set inside callbacks, thrown after decoding.
  let failure: string | null = null

  const decoder = Flac.create_libflac_decoder(true)
  if (!decoder) throw new FlacVerificationError('Could not create the FLAC decoder')

  try {
    Flac.FLAC__stream_decoder_set_md5_checking(decoder, true)
    const status = Flac.init_decoder_stream(
      decoder,
      // Read callback: feed the in-memory FLAC to the decoder piece by piece.
      (numberOfBytes) => {
        const end = Math.min(readOffset + numberOfBytes, flac.byteLength)
        const buffer = flac.subarray(readOffset, end)
        readOffset = end
        return { buffer, readDataLength: buffer.byteLength, error: false }
      },
      // Write callback: one decoded block, one array per channel. Returning false aborts decoding.
      (channelData, frameInfo) => {
        if (failure) return false
        const blockSize = frameInfo.blocksize
        if (decodedFrames + blockSize > frames || channelData.length !== info.channels) {
          failure = 'Decoded stream does not match the WAV layout'
          return false
        }
        for (let ch = 0; ch < channelData.length; ch++) {
          const data = channelData[ch]!
          // The decoded samples of one channel, as little-endian integers.
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
      // Error callback: remember the first error, reported after decoding stops.
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
  // Hash in 4 MB blocks: no extra copy of the whole file (except the 8-bit sign shift).
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

/** Joins the encoder's output chunks into one buffer. */
function concat(parts: Uint8Array[], length: number): Uint8Array<ArrayBuffer> {
  // One buffer of the final size, filled chunk after chunk.
  const out = new Uint8Array(length)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.byteLength
  }
  return out
}
