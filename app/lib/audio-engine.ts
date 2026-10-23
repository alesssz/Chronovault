import { clamp } from '~~/shared/utils/numbers'

/**
 * Audio engine: a single HTMLAudioElement for the whole app.
 *
 * It lives outside components (and outside Pinia's reactive state), so
 * playback keeps going while navigating between pages. The UI drives it
 * through the player store and receives its events.
 */

export interface AudioEngineEvents {
  time: (seconds: number) => void
  duration: (seconds: number) => void
  play: () => void
  pause: () => void
  ended: () => void
  buffering: (waiting: boolean) => void
  error: (message: string) => void
}

/** One set of callbacks per event name, typed by AudioEngineEvents. */
type Listeners = { [K in keyof AudioEngineEvents]: Set<AudioEngineEvents[K]> }

/** Minimal interface used by the store: lets tests swap in a fake engine. */
export interface PlaybackEngine {
  readonly element: HTMLAudioElement | null
  on<K extends keyof AudioEngineEvents>(event: K, listener: AudioEngineEvents[K]): () => void
  load(src: string): void
  /** Drops the current source: no further requests are made for it. */
  unload(): void
  play(): Promise<void>
  pause(): void
  stop(): void
  seek(seconds: number): void
  setVolume(volume: number): void
  setMuted(muted: boolean): void
  /** Playback speed (1 = normal), keeping the original pitch. */
  setPlaybackRate(rate: number): void
  readonly currentTime: number
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
    // (e.g. position changes while paused).
    element.addEventListener('timeupdate', () => {
      if (this.frame === null) this.emitTime()
    })
    // Streams may report Infinity/NaN before the real duration is known.
    element.addEventListener('durationchange', () => {
      if (Number.isFinite(element.duration)) this.emit('duration', element.duration)
    })
    element.addEventListener('waiting', () => this.emit('buffering', true))
    element.addEventListener('playing', () => this.emit('buffering', false))
    element.addEventListener('error', () => {
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
