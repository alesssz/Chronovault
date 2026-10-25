import { clamp } from '~~/shared/utils/numbers'

/**
 * Audio engine: a single HTMLAudioElement for the whole app.
 *
 * It lives outside components (and outside Pinia's reactive state), so
 * playback keeps going while navigating between pages. The UI drives it
 * through the player store and receives its events.
 */

/** The events the engine emits, and what each listener receives. */
export interface AudioEngineEvents {
  /** The playback position moved (seconds), at most every 50 ms while playing. */
  time: (seconds: number) => void
  /** The track's length became known or changed (seconds). */
  duration: (seconds: number) => void
  /** Playback started or resumed. */
  play: () => void
  /** Playback paused (by the user, the system or the end of a track). */
  pause: () => void
  /** The track played to its end. */
  ended: () => void
  /** Waiting for data (true), or playing again once it arrived (false). */
  buffering: (waiting: boolean) => void
  /** The audio failed, with a message to show. */
  error: (message: string) => void
}

/** One set of callbacks per event name, typed by AudioEngineEvents. */
type Listeners = { [K in keyof AudioEngineEvents]: Set<AudioEngineEvents[K]> }

/** Minimal interface used by the store: lets tests swap in a fake engine. */
export interface PlaybackEngine {
  /** The `<audio>` element itself (for casting); null where there is none (tests). */
  readonly element: HTMLAudioElement | null
  /** Subscribes to an event; returns the function that unsubscribes. */
  on<K extends keyof AudioEngineEvents>(event: K, listener: AudioEngineEvents[K]): () => void
  /** Starts loading an address (paused). */
  load(src: string): void
  /** Drops the current source: no further requests are made for it. */
  unload(): void
  /** Plays (rejects when the browser refuses, e.g. without a user gesture). */
  play(): Promise<void>
  /** Pauses, keeping the position. */
  pause(): void
  /** Pauses and goes back to the start. */
  stop(): void
  /** Moves to a position, in seconds. */
  seek(seconds: number): void
  /** Sets the volume, 0..1. */
  setVolume(volume: number): void
  /** Mutes or unmutes, keeping the volume. */
  setMuted(muted: boolean): void
  /** Playback speed (1 = normal), keeping the original pitch. */
  setPlaybackRate(rate: number): void
  /** The current position, in seconds. */
  readonly currentTime: number
  /** The track's length in seconds (0 while unknown). */
  readonly duration: number
}

/** Human-readable text for HTMLMediaElement error codes (MediaError.code). */
const MEDIA_ERRORS: Record<number, string> = {
  1: 'Playback aborted',
  2: 'Network error while loading the audio',
  3: 'The audio file could not be decoded',
  4: 'Audio format not supported by this browser',
}

/**
 * The real engine: a thin event layer over an HTMLAudioElement. It turns the
 * element's many events into the few the store needs (time, duration,
 * play/pause/ended, buffering, error) and adds a per-frame clock.
 */
export class AudioEngine implements PlaybackEngine {
  /** The one <audio> element of the app (also given to wavesurfer.js). */
  readonly element: HTMLAudioElement
  private readonly listeners: Listeners = {
    time: new Set(), duration: new Set(), play: new Set(), pause: new Set(),
    ended: new Set(), buffering: new Set(), error: new Set(),
  }

  /** requestAnimationFrame id of the running clock, null when stopped. */
  private frame: number | null = null
  /** Last time sent to listeners, to skip updates smaller than 50 ms. */
  private lastEmittedTime = -1

  /** @param element injectable for tests; a detached `new Audio()` in the app. */
  constructor(element: HTMLAudioElement = new Audio()) {
    this.element = element
    // Only the metadata (duration) is fetched up front; audio streams on demand.
    element.preload = 'metadata'

    element.addEventListener('play', () => {
      this.emit('play')
      this.startClock()
    })
    element.addEventListener('pause', () => {
      this.stopClock()
      this.emitTime(true)
      this.emit('pause')
    })
    element.addEventListener('ended', () => {
      this.stopClock()
      this.emitTime(true)
      this.emit('ended')
    })
    element.addEventListener('seeked', () => this.emitTime(true))
    // While the clock runs it already reports the time; timeupdate covers the rest
    // (e.g. position changes while paused). With the page hidden (screen off, another
    // tab, the app in the background) the browser stops drawing frames, so the clock
    // stays scheduled but never ticks while the audio plays on: timeupdate (still
    // ~4 times a second) takes over, or the position would freeze until the page shows
    // again (plays not counted, "previous" from the lock screen misjudging the position).
    element.addEventListener('timeupdate', () => {
      if (this.frame === null || isPageHidden()) this.emitTime()
    })
    // Streams may report Infinity/NaN before the real duration is known.
    element.addEventListener('durationchange', () => {
      if (Number.isFinite(element.duration)) this.emit('duration', element.duration)
    })
    element.addEventListener('waiting', () => this.emit('buffering', true))
    element.addEventListener('playing', () => this.emit('buffering', false))
    element.addEventListener('error', () => {
      // MediaError code (1-4), 0 when the browser gives none.
      const code = element.error?.code ?? 0
      this.emit('error', MEDIA_ERRORS[code] ?? 'Playback error')
    })
  }

  /** Current position, in seconds. */
  get currentTime(): number {
    return this.element.currentTime
  }

  /** Track length in seconds, 0 while unknown. */
  get duration(): number {
    return Number.isFinite(this.element.duration) ? this.element.duration : 0
  }

  /** Subscribes to an event; returns the function that unsubscribes. */
  on<K extends keyof AudioEngineEvents>(event: K, listener: AudioEngineEvents[K]): () => void {
    this.listeners[event].add(listener)
    return () => this.listeners[event].delete(listener)
  }

  /** Switches to a new source (a presigned URL); playback does not start by itself. */
  load(src: string): void {
    this.stopClock()
    this.lastEmittedTime = -1
    this.element.src = src
    this.element.load()
  }

  /** Empties the element: it stops and releases the stream (closing the player). */
  unload(): void {
    this.stopClock()
    this.lastEmittedTime = -1
    this.element.pause()
    this.element.removeAttribute('src')
    this.element.load()
  }

  /** Starts playback; rejects when the browser refuses (autoplay policy, bad source). */
  play(): Promise<void> {
    return this.element.play()
  }

  /** Pauses; the position is kept. */
  pause(): void {
    this.element.pause()
  }

  /** Pause and back to the start. */
  stop(): void {
    this.element.pause()
    this.seek(0)
  }

  /** Moves to `seconds`, clamped to the track (no upper bound while the duration is unknown). */
  seek(seconds: number): void {
    // The track's end, or no limit while its length is unknown.
    const max = this.duration || Number.POSITIVE_INFINITY
    this.element.currentTime = clamp(seconds, 0, max)
  }

  /** 0..1, clamped. */
  setVolume(volume: number): void {
    this.element.volume = clamp(volume, 0, 1)
  }

  /** Mutes without changing the volume level. */
  setMuted(muted: boolean): void {
    this.element.muted = muted
  }

  /** Playback speed, with the pitch preserved (slower without sounding lower). */
  setPlaybackRate(rate: number): void {
    this.element.preservesPitch = true
    // Loading a new source resets `playbackRate` to `defaultPlaybackRate`:
    // set both, so the speed survives a reload (e.g. a refreshed signed URL).
    this.element.defaultPlaybackRate = rate
    this.element.playbackRate = rate
  }

  /** Calls every listener of `event` with its arguments. */
  private emit<K extends keyof AudioEngineEvents>(event: K, ...args: Parameters<AudioEngineEvents[K]>): void {
    for (const listener of this.listeners[event]) {
      (listener as (...a: Parameters<AudioEngineEvents[K]>) => void)(...args)
    }
  }

  /** Emits the time only when it changed noticeably (≥ 50 ms). */
  private emitTime(force = false): void {
    // The element's position right now.
    const t = this.element.currentTime
    if (force || Math.abs(t - this.lastEmittedTime) >= 0.05) {
      this.lastEmittedTime = t
      this.emit('time', t)
    }
  }

  // While playing, the time is updated on every frame (`timeupdate` fires
  // only ~4 times per second: too coarse for smooth lyrics).
  private startClock(): void {
    if (this.frame !== null) return
    // Reschedules itself on every frame until stopClock().
    const tick = () => {
      this.emitTime()
      this.frame = requestAnimationFrame(tick)
    }
    this.frame = requestAnimationFrame(tick)
  }

  /** Stops the per-frame clock (pause, end, new source). */
  private stopClock(): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame)
    this.frame = null
  }
}

/** The page is not on screen: no animation frames are drawn (false where there is no document, e.g. tests). */
function isPageHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden'
}

/** The app-wide engine (one <audio> element for the whole session). */
let instance: PlaybackEngine | null = null

/** The shared engine; created on first use, in the browser only. */
export function getAudioEngine(): PlaybackEngine {
  if (!instance) {
    if (typeof window === 'undefined') throw new Error('AudioEngine is only available in the browser')
    instance = new AudioEngine()
  }
  return instance
}

/** Tests only: replaces the shared engine. */
export function setAudioEngine(engine: PlaybackEngine | null): void {
  instance = engine
}

/** Cached answer of canSetVolume() (the browser does not change mid-session). */
let volumeSettable: boolean | null = null

/**
 * Whether the page can change the audio volume. On iPhone and iPad the level
 * is always under the user's physical control: `volume` cannot be set from
 * JavaScript and always reads back 1, so a volume slider would do nothing
 * there (muting still works). Detected by setting a probe element's volume
 * and reading it back, rather than by sniffing the user agent (iPadOS
 * presents itself as a Mac).
 *
 * @param probe injectable for tests; a detached `new Audio()` in the app.
 */
export function canSetVolume(probe?: HTMLAudioElement): boolean {
  if (probe) return probeVolume(probe)
  if (volumeSettable === null) volumeSettable = probeVolume(new Audio())
  return volumeSettable
}

/**
 * Whether the page offers a volume level of its own (the slider), or leaves
 * the level to the device and plays at full volume (mute only).
 *
 * Only with a mouse or trackpad (a fine primary pointer) on a browser that
 * lets pages set the volume. On touch screens, phones and tablets alike, the
 * hardware buttons own the volume: a page level would multiply with theirs
 * (at 30% here, even their maximum sounds quiet, with no visible reason),
 * and being remembered on the device it could stay low for good, hidden
 * behind buttons that already do everything. On iPhone and iPad the page
 * cannot set it anyway (canSetVolume).
 *
 * The primary pointer, not the screen width, decides: a laptop with a touch
 * screen but used with its trackpad keeps the slider.
 *
 * Where it cannot be told (server rendering, unit tests: no window) the
 * answer is true, the behaviour the page had before this rule.
 *
 * @param settable injectable for tests; the browser's answer otherwise
 * @param finePointer injectable for tests; the `(pointer: fine)` media query otherwise
 */
export function pageControlsVolume(
  settable: () => boolean = canSetVolume,
  finePointer: () => boolean = () => window.matchMedia('(pointer: fine)').matches,
): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true
  return finePointer() && settable()
}

/** Sets an element's volume to an unusual level and checks that it stuck. */
function probeVolume(element: HTMLAudioElement): boolean {
  try {
    element.volume = 0.5
    return element.volume === 0.5
  }
  catch {
    // Some engines throw instead of ignoring the write: not settable either.
    return false
  }
}
