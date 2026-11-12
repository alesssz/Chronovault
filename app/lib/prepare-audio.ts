import { analyzeAudioFile, type AudioAnalysis } from '~/lib/audio-analysis'
import { convertWavToFlac } from '~/lib/flac/convert'
import { isWavFile } from '~/lib/flac/wav'
import { formatBytes } from '~~/shared/utils/time'

/**
 * Getting an audio file ready to store, in the browser: what a new track's
 * upload (useTrackUploader) and a track's Replace audio (useAudioReplace)
 * both do before sending anything.
 *   1. analysis: tags, cover, duration and waveform peaks (audio-analysis.ts);
 *   2. WAV only: lossless conversion to FLAC, verified bit for bit
 *      (docs/07-data-flows.md 7.4); when it cannot be verified, or FLAC
 *      cannot hold the file exactly, the original WAV is kept.
 * A replace uses only what is measured from the file (format, size,
 * duration, peaks): its tags are the upload's, the track keeps its own.
 */

/** Outcome of the WAV → FLAC step (null for non-WAV files). */
export type UploadConversion
  = | { kind: 'flac', originalBytes: number, flacBytes: number }
    | { kind: 'kept', reason: string }

/**
 * "FLAC · lossless … 70 MB → 35 MB (−50%)", or why the WAV was kept as is:
 * the line under a file in the upload list and in the Replace audio dialog.
 */
export function conversionLabel(conversion: UploadConversion): string {
  if (conversion.kind === 'kept') return `Kept as WAV: ${conversion.reason}`
  // Space saved, as a whole percentage.
  const saved = Math.round((1 - conversion.flacBytes / conversion.originalBytes) * 100)
  return `FLAC · lossless, verified bit for bit · ${formatBytes(conversion.originalBytes)} → ${formatBytes(conversion.flacBytes)} (−${saved}%)`
}

/** A file ready to upload, with what was read from it. */
export interface PreparedAudio {
  /** What is uploaded: the dropped file, or the verified FLAC a WAV became. */
  file: File
  /** The type it is stored with (`audio/flac` after a conversion). */
  mimeType: string
  /** Tags, cover, duration and peaks read from the dropped file. */
  analysis: AudioAnalysis
  /** What the WAV → FLAC step did; null for other formats. */
  conversion: UploadConversion | null
}

/** Where preparing a file has got to, for the caller's status line. */
export interface PrepareAudioHooks {
  /** The file is analyzed (the upload list shows the title from the tags while a WAV converts). */
  onAnalyzed?: (analysis: AudioAnalysis) => void
  /** The analysis is done and, for a WAV, the conversion starts. */
  onConverting?: () => void
  /** 0..1, progress of the conversion (encoding + verification). */
  onConversionProgress?: (fraction: number) => void
}

/**
 * Analyzes `file` and, for a WAV, converts it to FLAC (keeping the WAV when
 * that cannot be done exactly). Throws only for formats the app does not take.
 */
export async function prepareAudio(file: File, hooks: PrepareAudioHooks = {}): Promise<PreparedAudio> {
  // Tags, cover, duration and waveform, read in the browser.
  const analysis = await analyzeAudioFile(file)
  hooks.onAnalyzed?.(analysis)
  if (!isWavFile(file)) return { file, mimeType: analysis.mimeType, analysis, conversion: null }

  hooks.onConverting?.()
  // The verified FLAC, or the reason the WAV is kept.
  const result = await convertWavToFlac(file, fraction => hooks.onConversionProgress?.(fraction))
  if (result.status === 'converted') {
    return {
      file: result.file,
      mimeType: 'audio/flac',
      analysis,
      conversion: { kind: 'flac', originalBytes: file.size, flacBytes: result.file.size },
    }
  }
  return { file, mimeType: analysis.mimeType, analysis, conversion: { kind: 'kept', reason: result.reason } }
}
