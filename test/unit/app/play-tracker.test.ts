/**
 * When listening becomes a play (app/lib/play-tracker.ts): 30 s or half a short track, completed
 * at 90%, only time really listened (no seeks, no pauses, no slowed-down playback), once per track
 * until reset.
 */
import { describe, expect, it } from 'vitest'
import { COMPLETED_SHARE, createPlayTracker, PLAY_THRESHOLD_SECONDS, type PlayEvent } from '~/lib/play-tracker'

/**
 * Feeds the tracker positions from `from` to `to` in `step`-second updates (like the player's
 * animation frames) and returns the events, in order.
 */
function listen(
  tracker: ReturnType<typeof createPlayTracker>,
  { from, to, duration, step = 0.25, listening = true }: { from: number, to: number, duration: number, step?: number, listening?: boolean },
): PlayEvent[] {
  // Events that are not null, in the order they happened.
  const events: PlayEvent[] = []
  for (let time = from; time <= to + 1e-9; time += step) {
    // What this position update made: a play, a completed play, or nothing.
    const event = tracker.update({ time, duration, listening })
    if (event) events.push(event)
  }
  return events
}

describe('createPlayTracker', () => {
  it('counts a play after 30 seconds of a long track, and completes it at 90%', () => {
    // A fresh tracker for this listen.
    const tracker = createPlayTracker()
    expect(listen(tracker, { from: 0, to: PLAY_THRESHOLD_SECONDS - 1, duration: 200 })).toEqual([])
    expect(listen(tracker, { from: PLAY_THRESHOLD_SECONDS - 0.75, to: PLAY_THRESHOLD_SECONDS + 1, duration: 200 })).toEqual(['play'])
    expect(listen(tracker, { from: PLAY_THRESHOLD_SECONDS + 1.25, to: 200 * COMPLETED_SHARE + 1, duration: 200 })).toEqual(['completed'])
  })

  it('counts half of a short track as a play', () => {
    // A fresh tracker for this listen.
    const tracker = createPlayTracker()
    // A 20-second track: a play at 10 s, completed at 18 s.
    expect(listen(tracker, { from: 0, to: 9.5, duration: 20 })).toEqual([])
    expect(listen(tracker, { from: 9.75, to: 10.5, duration: 20 })).toEqual(['play'])
    expect(listen(tracker, { from: 10.75, to: 20, duration: 20 })).toEqual(['completed'])
  })

  it('does not count a seek: dragging to the end is not listening', () => {
    // A fresh tracker for this listen.
    const tracker = createPlayTracker()
    expect(listen(tracker, { from: 0, to: 5, duration: 200 })).toEqual([])
    // A jump to 3:00, then a few seconds: far from 30 s of listening.
    expect(listen(tracker, { from: 180, to: 185, duration: 200 })).toEqual([])
  })

  it('does not count time while paused or slowed down', () => {
    // A fresh tracker for this listen.
    const tracker = createPlayTracker()
    expect(listen(tracker, { from: 0, to: 60, duration: 200, listening: false })).toEqual([])
  })

  it('counts updates up to 1.5 s apart (a background tab), not longer ones', () => {
    // Updates a second apart: still listening.
    const slow = createPlayTracker()
    expect(listen(slow, { from: 0, to: 40, duration: 200, step: 1 })).toEqual(['play'])
    // Updates two seconds apart: jumps, not listening.
    const jumpy = createPlayTracker()
    expect(listen(jumpy, { from: 0, to: 60, duration: 200, step: 2 })).toEqual([])
  })

  it('reports once per track, and again after a reset', () => {
    // A fresh tracker for this listen.
    const tracker = createPlayTracker()
    expect(listen(tracker, { from: 0, to: 40, duration: 200 })).toEqual(['play'])
    // Going back and listening again: already counted.
    expect(listen(tracker, { from: 0, to: 40, duration: 200 })).toEqual([])
    tracker.reset()
    expect(listen(tracker, { from: 0, to: 40, duration: 200 })).toEqual(['play'])
  })

  it('waits for the duration before completing, and uses 30 s meanwhile', () => {
    // A fresh tracker for this listen.
    const tracker = createPlayTracker()
    expect(listen(tracker, { from: 0, to: 31, duration: 0 })).toEqual(['play'])
  })
})
