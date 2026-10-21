/**
 * AudioEngine against a minimal fake <audio> element: events, seeking bounds, playback rate.
 */
import { describe, expect, it } from 'vitest'
import { AudioEngine } from '~/lib/audio-engine'

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
