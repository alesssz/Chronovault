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

const MEDIA_ERRORS: Record<number, string> = {
  1: 'Playback aborted',
  2: 'Network error while loading the audio',
  3: 'The audio file could not be decoded',
  4: 'Audio format not supported by this browser',
}

export class AudioEngine implements PlaybackEngine {
  readonly element: HTMLAudioElement
  private readonly listeners: Listeners = {
    time: new Set(), duration: new Set(), play: new Set(), pause: new Set(),
    ended: new Set(), buffering: new Set(), error: new Set(),
  }

  private frame: number | null = null
  private lastEmittedTime = -1

  constructor(element: HTMLAudioElement = new Audio()) {
    this.element = element
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
    element.addEventListener('timeupdate', () => {
      if (this.frame === null) this.emitTime()
    })
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

  get currentTime(): number {
    return this.element.currentTime
  }

  get duration(): number {
    return Number.isFinite(this.element.duration) ? this.element.duration : 0
  }

  on<K extends keyof AudioEngineEvents>(event: K, listener: AudioEngineEvents[K]): () => void {
    this.listeners[event].add(listener)
    return () => this.listeners[event].delete(listener)
  }

  load(src: string): void {
    this.stopClock()
    this.lastEmittedTime = -1
    this.element.src = src
    this.element.load()
  }

  unload(): void {
    this.stopClock()
    this.lastEmittedTime = -1
    this.element.pause()
    this.element.removeAttribute('src')
    this.element.load()
  }

  play(): Promise<void> {
    return this.element.play()
  }

  pause(): void {
    this.element.pause()
  }

  stop(): void {
    this.element.pause()
    this.seek(0)
  }

  seek(seconds: number): void {
    const max = this.duration || Number.POSITIVE_INFINITY
    this.element.currentTime = Math.min(Math.max(0, seconds), max)
  }

  setVolume(volume: number): void {
    this.element.volume = Math.min(1, Math.max(0, volume))
  }

  setMuted(muted: boolean): void {
    this.element.muted = muted
  }

  setPlaybackRate(rate: number): void {
    this.element.preservesPitch = true
    // Loading a new source resets `playbackRate` to `defaultPlaybackRate`:
    // set both, so the speed survives a reload (e.g. a refreshed signed URL).
    this.element.defaultPlaybackRate = rate
    this.element.playbackRate = rate
  }

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
    const tick = () => {
      this.emitTime()
      this.frame = requestAnimationFrame(tick)
    }
    this.frame = requestAnimationFrame(tick)
  }

  private stopClock(): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame)
    this.frame = null
  }
}

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
