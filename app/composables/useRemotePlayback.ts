import type { MaybeRefOrGetter } from 'vue'

/**
 * Casting the player's audio to a device on the Wi-Fi network: a TV or
 * speaker with Chromecast built in (Google TV, Android TV, Nest speakers…)
 * from Chrome-based browsers on Android, or an AirPlay device from Safari on
 * iPhone and iPad.
 *
 * Built on the browser's Remote Playback API (`element.remote`): the
 * browser finds the devices, shows its own device picker and hands the
 * media address to the device, which then fetches and plays the audio
 * itself. The <audio> element stays the controller: play, pause, seeking,
 * the lock-screen controls and the app's own buttons all keep working, now
 * acting on the device. Audio addresses are signed URLs valid for 6 hours,
 * long enough for the device to fetch a whole track.
 *
 * Not available in Firefox, nor towards TVs without Chromecast or AirPlay
 * (there, Android's screen mirroring is the way). Bluetooth speakers need
 * nothing from the app: Android routes all audio to them.
 *
 * Returns:
 * - `available`: a device can be offered (or the browser cannot tell until
 *   asked, see watch()), so the Cast button should be shown;
 * - `state`: 'disconnected', 'connecting' or 'connected', as the browser
 *   reports it;
 * - `prompt()`: opens the browser's device picker (also the way to stop or
 *   change device while connected); must run from a click. Besides the
 *   outcome it returns the browser's own answer when it refused (`detail`):
 *   casting cannot be tried from a test browser, so on a real phone that
 *   text is what tells why it failed (shown in the message under the
 *   button).
 */

/**
 * How prompt() ended, for the caller's feedback: 'unsupported' means this
 * browser cannot cast at all (no API, or it refused without showing a
 * picker), so the user should try another browser.
 */
export type CastPromptResult = 'done' | 'cancelled' | 'no-devices' | 'unsupported' | 'failed'

/** What prompt() returns: the outcome, and the browser's own answer when it refused. */
export interface CastPromptOutcome {
  /** What happened (see CastPromptResult). */
  result: CastPromptResult
  /**
   * The browser's refusal as it gave it, with how quickly it came, e.g.
   * "NotSupportedError: The currentSrc is not compatible with remote
   * playback (12 ms)"; null when it did not refuse.
   */
  detail: string | null
}

/**
 * A refusal this fast (ms) did not come from a person closing a picker: no
 * picker was shown at all. Browsers built on Chromium without Google's
 * casting service (e.g. Opera on Android) answer a tap on Cast this way, with
 * the same error a closed picker gives (NotAllowedError).
 */
const INSTANT_REFUSAL_MS = 300

/**
 * Cast state of an `<audio>` element: `available` (a device can be offered),
 * `state` (disconnected, connecting, connected) and `prompt()` (opens the
 * browser's device picker). Follows a new element when `element` changes.
 */
export function useRemotePlayback(element: MaybeRefOrGetter<HTMLMediaElement | null | undefined>) {
  /** A device can be offered: show the Cast button. */
  const available = ref(false)
  /** Connection to the device, as the browser reports it. */
  const state = ref<RemotePlaybackState>('disconnected')

  /** The element's RemotePlayback object currently watched, and its availability watch id. */
  let watched: RemotePlayback | null = null
  let watchId: number | null = null

  /** Copies the browser's connection state (on every connecting/connect/disconnect event). */
  function syncState(): void {
    state.value = watched?.state ?? 'disconnected'
  }

  /** Starts following an element's devices and connection; nothing where the API is missing. */
  function watchElement(el: HTMLMediaElement | null | undefined): void {
    // The element's RemotePlayback object (absent where the API is missing).
    const remote = el?.remote
    if (!remote) return
    watched = remote
    syncState()
    for (const event of ['connecting', 'connect', 'disconnect']) remote.addEventListener(event, syncState)
    remote.watchAvailability((isAvailable) => {
      available.value = isAvailable
    }).then((id) => {
      watchId = id
    }).catch((error: unknown) => {
      // NotSupportedError: the browser cannot keep looking for devices in the background
      // (e.g. to save battery) but can still look when asked: show the button, and
      // prompt() says whether anything was found. Any other refusal (remote playback
      // disabled on the element) leaves the button hidden.
      if (error instanceof DOMException && error.name === 'NotSupportedError') available.value = true
    })
  }

  /** Stops following the current element (it changed, or the component went away). */
  function unwatch(): void {
    if (!watched) return
    for (const event of ['connecting', 'connect', 'disconnect']) watched.removeEventListener(event, syncState)
    if (watchId !== null) watched.cancelWatchAvailability(watchId).catch(() => {})
    watched = null
    watchId = null
    available.value = false
    state.value = 'disconnected'
  }

  // A new element (or none): drop the old one's listeners and follow the new one.
  watch(() => toValue(element), (el) => {
    unwatch()
    watchElement(el)
  }, { immediate: true })
  onScopeDispose(unwatch)

  /**
   * Opens the browser's device picker: pick a device to cast to, or, while
   * connected, stop casting or switch device. Must be called from a click
   * (browsers refuse it otherwise).
   */
  async function prompt(): Promise<CastPromptOutcome> {
    // No Remote Playback API in this browser (e.g. Firefox).
    if (!watched) return { result: 'unsupported', detail: 'no Remote Playback API' }
    // When the picker was asked for: an instant refusal means it was never shown.
    const startedAt = performance.now()
    try {
      await watched.prompt()
      return { result: 'done', detail: null }
    }
    catch (error) {
      // How long the browser took to refuse.
      const elapsed = performance.now() - startedAt
      // The error's name (NotFoundError, NotAllowedError…) and message, as the browser gave them.
      const name = error instanceof DOMException ? error.name : ''
      const message = error instanceof Error ? error.message : String(error)
      // "Name: message (N ms)": what the browser said, and whether it showed anything first.
      const detail = `${name || 'Error'}${message ? `: ${message}` : ''} (${Math.round(elapsed)} ms)`
      // No TV or speaker on this network (or none that can play this kind of audio).
      if (name === 'NotFoundError') return { result: 'no-devices', detail }
      // The browser says outright that it cannot cast (this audio, or at all).
      if (name === 'NotSupportedError') return { result: 'unsupported', detail }
      if (name === 'NotAllowedError' || name === 'AbortError') {
        // Either the picker was closed without choosing anything (silence is right: the
        // browser showed its own picker), or it never appeared, which is too quick to be a
        // person's doing and means this browser cannot cast (see INSTANT_REFUSAL_MS).
        return { result: elapsed < INSTANT_REFUSAL_MS ? 'unsupported' : 'cancelled', detail }
      }
      return { result: 'failed', detail }
    }
  }

  return { available, state, prompt }
}
