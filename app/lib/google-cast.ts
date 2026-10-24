/**
 * The Google Cast Web Sender SDK ("CAF sender"), loaded on demand.
 *
 * Why it may be needed: Chrome on Android lists a Chromecast built-in TV in
 * its own "Cast…" menu, but the Remote Playback API (the standard way pages
 * cast an <audio> or <video>) found no device for it (see /cast-test). The
 * Cast SDK goes through the same Google Cast route as that menu. It works
 * in browsers with Google Cast built in (Chrome on desktop and Android,
 * Edge), not in Opera, Firefox or on iOS.
 *
 * The SDK is a script from gstatic.com that defines `window.cast` and
 * `window.chrome.cast`, then calls `window.__onGCastApiAvailable`. Only the
 * few parts used here are typed below (there is no type package installed),
 * as `GoogleCast`. loadGoogleCast() loads it once and resolves with them, or
 * with null and the reason when the browser has no Google Cast.
 */

/** The SDK's script; `loadCastFramework=1` adds the `cast.framework` layer on top of `chrome.cast`. */
const SDK_URL = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1'

/** The Cast session with a device: sends media to it. */
export interface CastSession {
  /** Asks the device to load and play media; resolves when it accepts, rejects with an error code. */
  loadMedia: (request: CastLoadRequest) => Promise<unknown>
  /** The device's name, as its owner set it ("Living room TV"). */
  getCastDevice: () => { friendlyName: string }
  /** The media playing on the device, with its state, or null. */
  getMediaSession: () => { playerState: string, idleReason?: string | null } | null
}

/** The SDK's entry point for the page: options, connection state, sessions. */
export interface CastContext {
  setOptions: (options: { receiverApplicationId: string, autoJoinPolicy: string }) => void
  /** NO_DEVICES_AVAILABLE, NOT_CONNECTED, CONNECTING or CONNECTED. */
  getCastState: () => string
  addEventListener: (type: string, handler: (event: { castState?: string, sessionState?: string }) => void) => void
  /** Opens the device picker (from a click); rejects with an error code ('cancel', 'receiver_unavailable'…). */
  requestSession: () => Promise<unknown>
  getCurrentSession: () => CastSession | null
  endCurrentSession: (stopCasting: boolean) => void
}

/** What the device is asked to play. */
export interface CastMediaInfo {
  contentUrl?: string
  streamType?: string
  metadata?: CastMusicMetadata
}

/** Track information shown on the TV. */
export interface CastMusicMetadata {
  title?: string
  artist?: string
  albumName?: string
  images?: unknown[]
}

/** A load request (opaque here: built from a CastMediaInfo, handed to loadMedia). */
export type CastLoadRequest = object

/** The parts of the SDK globals this app uses. */
export interface GoogleCast {
  context: CastContext
  /** `cast.framework.CastContextEventType`. */
  CastContextEventType: { CAST_STATE_CHANGED: string, SESSION_STATE_CHANGED: string }
  /** Google's own receiver app: plays a media URL and shows its metadata, no registration needed. */
  DEFAULT_MEDIA_RECEIVER_APP_ID: string
  /** `chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED`: rejoin a session started from this site. */
  ORIGIN_SCOPED: string
  MediaInfo: new (contentId: string, contentType: string) => CastMediaInfo
  MusicTrackMediaMetadata: new () => CastMusicMetadata
  LoadRequest: new (mediaInfo: CastMediaInfo) => CastLoadRequest
  Image: new (url: string) => unknown
}

/** The SDK globals once loaded (untyped as a whole: only GoogleCast is used outside). */
interface CastWindow {
  __onGCastApiAvailable?: (available: boolean, reason?: string) => void
  cast?: { framework: Record<string, unknown> & { CastContext: { getInstance: () => CastContext } } }
  chrome?: { cast?: Record<string, unknown> & { media: Record<string, unknown> } }
}

/** The one loading attempt (the script must be added once per page). */
let loading: Promise<{ cast: GoogleCast | null, reason: string | null }> | null = null

/**
 * Loads the SDK (once) and resolves with its parts, or with `cast: null` and
 * the reason when the browser has no Google Cast (or the script cannot load).
 * Browser only.
 */
export function loadGoogleCast(): Promise<{ cast: GoogleCast | null, reason: string | null }> {
  loading ??= new Promise((resolve) => {
    const w = window as unknown as CastWindow
    w.__onGCastApiAvailable = (available, reason) => {
      if (!available || !w.cast || !w.chrome?.cast) {
        resolve({ cast: null, reason: reason || 'Google Cast is not available in this browser' })
        return
      }
      const framework = w.cast.framework
      const chromeCast = w.chrome.cast
      const media = chromeCast.media
      resolve({
        cast: {
          context: framework.CastContext.getInstance(),
          CastContextEventType: framework.CastContextEventType as GoogleCast['CastContextEventType'],
          DEFAULT_MEDIA_RECEIVER_APP_ID: media.DEFAULT_MEDIA_RECEIVER_APP_ID as string,
          ORIGIN_SCOPED: (chromeCast.AutoJoinPolicy as { ORIGIN_SCOPED: string }).ORIGIN_SCOPED,
          MediaInfo: media.MediaInfo as GoogleCast['MediaInfo'],
          MusicTrackMediaMetadata: media.MusicTrackMediaMetadata as GoogleCast['MusicTrackMediaMetadata'],
          LoadRequest: media.LoadRequest as GoogleCast['LoadRequest'],
          Image: chromeCast.Image as GoogleCast['Image'],
        },
        reason: null,
      })
    }
    const script = document.createElement('script')
    script.src = SDK_URL
    script.async = true
    // Blocked or offline: say so instead of waiting forever.
    script.onerror = () => resolve({ cast: null, reason: 'The Google Cast script could not be loaded' })
    document.head.append(script)
  })
  return loading
}

/** The text of an SDK error: an error code string, an object with a `code`, or anything else. */
export function castErrorText(error: unknown): string {
  if (typeof error === 'string') return error
  if (error && typeof error === 'object') {
    const { code, description } = error as { code?: unknown, description?: unknown }
    if (code) return `${String(code)}${description ? `: ${String(description)}` : ''}`
  }
  if (error instanceof Error) return error.message
  return String(error)
}
