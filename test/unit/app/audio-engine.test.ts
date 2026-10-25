/**
 * AudioEngine against a minimal fake <audio> element: events, seeking bounds, playback rate,
 * the position still reported with the page hidden (screen off: no animation frames); who gets a
 * volume slider (a mouse or trackpad, not a touch screen); plus the
 * volume-support probe (iOS ignores the volume set from JavaScript).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AudioEngine, canSetVolume, pageControlsVolume } from '~/lib/audio-engine'

/** Just enough of an HTMLAudioElement for the engine's setters. */
function fakeAudioElement() {
  return {
    preload: '',
    playbackRate: 1,
    defaultPlaybackRate: 1,
    preservesPitch: false,
    addEventListener: () => {},
  }
}

describe('AudioEngine.setPlaybackRate', () => {
  it('sets the speed, keeps the pitch and survives a source reload', () => {
    const element = fakeAudioElement()
    // The engine wraps the fake element exactly like a real <audio>.
    const engine = new AudioEngine(element as unknown as HTMLAudioElement)

    engine.setPlaybackRate(0.75)

    expect(element.playbackRate).toBe(0.75)
    expect(element.preservesPitch).toBe(true)
    // Loading a new source resets playbackRate to defaultPlaybackRate.
    expect(element.defaultPlaybackRate).toBe(0.75)
  })
})

/**
 * A fake element that keeps its listeners, so tests can fire its events, and plays at a
 * position the test sets.
 */
function playableElement() {
  const listeners = new Map<string, () => void>()
  return {
    preload: '',
    currentTime: 0,
    addEventListener: (event: string, listener: () => void) => void listeners.set(event, listener),
    /** Fires one of the element's events, as the browser would. */
    fire: (event: string) => listeners.get(event)?.(),
  }
}

describe('AudioEngine time reports', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  /** An engine playing on `element`, its per-frame clock scheduled but never ticking (as when hidden). */
  function playingEngine(element: ReturnType<typeof playableElement>) {
    // Frames are scheduled, never drawn: exactly a hidden page.
    vi.stubGlobal('requestAnimationFrame', () => 1)
    vi.stubGlobal('cancelAnimationFrame', () => {})
    const engine = new AudioEngine(element as unknown as HTMLAudioElement)
    const times: number[] = []
    engine.on('time', t => void times.push(t))
    element.fire('play')
    return times
  }

  it('leaves the position to the per-frame clock while the page shows', () => {
    vi.stubGlobal('document', { visibilityState: 'visible' })
    const element = playableElement()
    const times = playingEngine(element)
    element.currentTime = 12
    element.fire('timeupdate')
    expect(times).toEqual([])
  })

  it('keeps reporting the position from timeupdate with the page hidden (screen off)', () => {
    vi.stubGlobal('document', { visibilityState: 'hidden' })
    const element = playableElement()
    const times = playingEngine(element)
    element.currentTime = 12
    element.fire('timeupdate')
    element.currentTime = 12.25
    element.fire('timeupdate')
    expect(times).toEqual([12, 12.25])
  })
})

describe('pageControlsVolume', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  /** A browser window whose media queries answer nothing in particular (the injected checks decide). */
  function stubWindow() {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) })
  }

  it('offers a slider with a mouse or trackpad, where the page can set the volume', () => {
    stubWindow()
    expect(pageControlsVolume(() => true, () => true)).toBe(true)
  })

  it('leaves the volume to the hardware buttons on touch screens (phones and tablets)', () => {
    stubWindow()
    expect(pageControlsVolume(() => true, () => false)).toBe(false)
  })

  it('offers none where the page cannot set it, a trackpad notwithstanding (iPad)', () => {
    stubWindow()
    expect(pageControlsVolume(() => false, () => true)).toBe(false)
  })

  it('keeps the slider where it cannot tell (server rendering, unit tests: no window)', () => {
    vi.stubGlobal('window', undefined)
    expect(pageControlsVolume(() => false, () => false)).toBe(true)
  })
})

describe('canSetVolume', () => {
  it('is true when the volume sticks (desktop browsers, Android)', () => {
    const probe = { volume: 1 }
    expect(canSetVolume(probe as unknown as HTMLAudioElement)).toBe(true)
  })

  it('is false when the volume always reads back 1 (iPhone, iPad)', () => {
    // iOS ignores the write: the getter keeps answering 1.
    const probe = {
      get volume() {
        return 1
      },
      set volume(_: number) {},
    }
    expect(canSetVolume(probe as unknown as HTMLAudioElement)).toBe(false)
  })

  it('is false when setting the volume throws', () => {
    const probe = {
      get volume() {
        return 1
      },
      set volume(_: number) {
        throw new Error('read-only')
      },
    }
    expect(canSetVolume(probe as unknown as HTMLAudioElement)).toBe(false)
  })
})
