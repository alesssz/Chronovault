/**
 * Web Worker running the WAV → FLAC conversion off the main thread
 * (encoding + verification of a 70 MB WAV takes several seconds).
 *
 * Protocol (see convert.ts for the other side):
 *   main → worker   { buffer }                       the whole WAV file (transferred)
 *   worker → main   { type: 'progress', value }      0..1, many times
 *                   { type: 'converted', flac, md5 } verified FLAC (transferred)
 *                   { type: 'kept', reason }         keep the original WAV
 */
import wasmUrl from 'libflacjs/dist/libflac.wasm.wasm?url'
import { encodeWavToFlac, type FlacLib } from './encoder'
import { flacIncompatibility, parseWav } from './wav'

/** Message received from the page. */
export interface FlacWorkerRequest {
  buffer: ArrayBuffer
}

/** Messages sent back to the page. */
export type FlacWorkerResponse
  = | { type: 'progress', value: number }
    | { type: 'converted', flac: ArrayBuffer, md5: string }
    | { type: 'kept', reason: string }

/** The parts of the worker global scope used here (the DOM lib types `self` as Window). */
interface WorkerScope {
  FLAC_SCRIPT_LOCATION?: Record<string, string>
  onmessage: ((event: MessageEvent<FlacWorkerRequest>) => void) | null
  postMessage: (message: FlacWorkerResponse, transfer?: Transferable[]) => void
  addEventListener: (type: 'unhandledrejection', listener: (event: PromiseRejectionEvent) => void) => void
}

const scope = self as unknown as WorkerScope

// libflac.js looks up its .wasm file through FLAC_SCRIPT_LOCATION: on the global
// object, or on `process.env` when a `process` object exists (the Vite dev server
// defines one inside workers). Point both at the URL emitted by Vite.
const wasmLocation = { 'libflac.wasm.wasm': wasmUrl }
scope.FLAC_SCRIPT_LOCATION = wasmLocation
// `process` exists only in some environments (the Vite dev server shims it in workers).
const workerProcess = (globalThis as { process?: { env?: Record<string, unknown> } }).process
if (workerProcess?.env) workerProcess.env.FLAC_SCRIPT_LOCATION = wasmLocation

/** libFLAC must be ready within this time, otherwise the WAV is kept. */
const LOAD_TIMEOUT_MS = 20_000

/** libFLAC is loaded once per worker, on the first conversion. */
let flacPromise: Promise<FlacLib> | null = null

/** Loads libFLAC (WebAssembly build) and waits until its runtime is initialized. */
function loadFlac(): Promise<FlacLib> {
  flacPromise ??= import('libflacjs/dist/libflac.wasm.js').then((mod) => {
    // The UMD bundle exposes the API either as the default export or as the module itself.
    const Flac = ((mod as { default?: FlacLib }).default ?? mod) as FlacLib
    if (Flac.isReady()) return Flac
    return new Promise<FlacLib>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('The FLAC encoder could not be loaded')), LOAD_TIMEOUT_MS)
      Flac.on('ready', () => {
        clearTimeout(timer)
        resolve(Flac)
      })
    })
  })
  return flacPromise
}

// Failures inside libFLAC's own async code (e.g. its WebAssembly not loading)
// surface as unhandled rejections: report them so the WAV is kept.
scope.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason instanceof Error ? event.reason.message : String(event.reason)
  scope.postMessage({ type: 'kept', reason: `FLAC encoder error: ${reason}` })
})

/** One conversion per message: parse → check compatibility → encode + verify → reply. */
scope.onmessage = async (event) => {
  try {
    // The transferred WAV file, as bytes.
    const wav = new Uint8Array(event.data.buffer)
    const info = parseWav(wav)
    const reason = flacIncompatibility(info)
    if (reason) {
      scope.postMessage({ type: 'kept', reason })
      return
    }

    const Flac = await loadFlac()
    const { flac, md5 } = await encodeWavToFlac(Flac, wav, info, (value) => {
      scope.postMessage({ type: 'progress', value })
    })

    // Pointless conversion (e.g. white noise does not compress): keep the WAV.
    if (flac.byteLength >= wav.byteLength) {
      scope.postMessage({ type: 'kept', reason: 'FLAC would not be smaller than the WAV' })
      return
    }
    scope.postMessage({ type: 'converted', flac: flac.buffer, md5 }, [flac.buffer])
  }
  catch (error) {
    // Any failure (parsing, encoding, verification) means: keep the original WAV.
    const message = error instanceof Error ? error.message : String(error)
    scope.postMessage({ type: 'kept', reason: message })
  }
}
