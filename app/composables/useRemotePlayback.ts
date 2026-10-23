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
 *   change device while connected); must run from a click.
 */

/** How prompt() ended, for the caller's feedback. */
export type CastPromptResult = 'done' | 'cancelled' | 'no-devices' | 'failed'

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
  async function prompt(): Promise<CastPromptResult> {
    if (!watched) return 'failed'
    try {
      await watched.prompt()
      return 'done'
    }
    catch (error) {
      const name = error instanceof DOMException ? error.name : ''
      // The picker was closed without choosing anything.
      if (name === 'NotAllowedError' || name === 'AbortError') return 'cancelled'
      // No TV or speaker on this network (or none that can play this kind of audio).
      if (name === 'NotFoundError') return 'no-devices'
      return 'failed'
    }
  }

  return { available, state, prompt }
}
