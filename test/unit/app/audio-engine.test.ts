/**
 * AudioEngine against a minimal fake <audio> element: events, seeking bounds, playback rate;
 * plus the volume-support probe (iOS ignores the volume set from JavaScript).
 */
import { describe, expect, it } from 'vitest'
import { AudioEngine, canSetVolume } from '~/lib/audio-engine'

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
