import type { FlacWorkerResponse } from './flac.worker'

/** Outcome of a conversion: the verified FLAC (with the audio MD5), or why the WAV is kept. */
export type FlacConversion
  = | { status: 'converted', file: File, md5: string }
    | { status: 'kept', reason: string }

/**
 * Without any message from the worker for this long (no progress, no result),
 * the conversion is abandoned and the original WAV is kept.
 */
const INACTIVITY_TIMEOUT_MS = 30_000

/**
 * Converts a WAV file to a verified, bit-identical FLAC in a Web Worker.
 * It never throws and never hangs: whenever the conversion is not possible,
 * not verified or the worker stops responding, the result is `kept` and the
 * caller uploads the original WAV.
 */
export async function convertWavToFlac(file: File, onProgress?: (fraction: number) => void): Promise<FlacConversion> {
  const buffer = await file.arrayBuffer()
  // A module worker keeps the heavy work (and libFLAC's memory) off the UI thread.
  const worker = new Worker(new URL('./flac.worker.ts', import.meta.url), { type: 'module' })
  // Timer that gives up when the worker stays silent too long.
  let watchdog: ReturnType<typeof setTimeout> | undefined

  try {
    return await new Promise<FlacConversion>((resolve) => {
      // Watchdog: restarted by every message, it fires only after 30 s of silence.
      const keepAlive = () => {
        clearTimeout(watchdog)
        watchdog = setTimeout(
          () => resolve({ status: 'kept', reason: 'The FLAC converter stopped responding' }),
          INACTIVITY_TIMEOUT_MS,
        )
      }
      keepAlive()

      worker.onmessage = (event: MessageEvent<FlacWorkerResponse>) => {
        keepAlive()
        const message = event.data
        if (message.type === 'progress') {
          onProgress?.(message.value)
        }
        else if (message.type === 'converted') {
          resolve({
            status: 'converted',
            file: new File([message.flac], toFlacName(file.name), { type: 'audio/flac', lastModified: file.lastModified }),
            md5: message.md5,
          })
        }
        else {
          resolve({ status: 'kept', reason: message.reason })
        }
      }
      worker.onerror = () => resolve({ status: 'kept', reason: 'The FLAC converter could not run in this browser' })
      worker.onmessageerror = () => resolve({ status: 'kept', reason: 'The FLAC converter returned unreadable data' })
      // Transfer (not copy) the buffer: no second copy of a 70 MB file in memory.
      worker.postMessage({ buffer }, [buffer])
    })
  }
  finally {
    // Always free the worker, whatever the outcome (also after a watchdog timeout).
    clearTimeout(watchdog)
    worker.terminate()
  }
}

/** `Song.wav` / `Song.WAVE` → `Song.flac`. */
function toFlacName(name: string): string {
  return `${name.replace(/\.wave?$/i, '')}.flac`
}
