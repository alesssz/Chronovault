/**
 * Decides when listening to a track becomes a play, from the player's
 * position as it moves (app/plugins/play-counter.client.ts feeds it).
 *
 * Only time really listened counts: the position moving forward a little at
 * a time while playing. A seek (a jump), a pause or a slowed-down playback
 * (the lyrics sync editor) adds nothing, so dragging the waveform to the end
 * is not a play.
 *
 * - a **play**: PLAY_THRESHOLD_SECONDS listened, or half of a shorter track;
 * - **completed**: COMPLETED_SHARE of the track listened.
 *
 * Pure (no Vue, no timers), so the rules are unit-tested on their own.
 */

/** Seconds of listening that make a play (half the track when it is shorter than twice this). */
export const PLAY_THRESHOLD_SECONDS = 30
/** Share of the track to listen to for a completed play. */
export const COMPLETED_SHARE = 0.9
/**
 * Largest step between two position updates still counted as listening
 * (updates come every animation frame, ~16 ms; a background tab slows them
 * to about one per second). Anything longer is a seek.
 */
export const MAX_STEP_SECONDS = 1.5

/** What a position update completed: a play, a completed play, or nothing. */
export type PlayEvent = 'play' | 'completed' | null

/** One position update from the player. */
export interface PlayTick {
  /** Position in the track, in seconds. */
  time: number
  /** Duration of the track, in seconds (0 when not known yet). */
  duration: number
  /** Audio is playing at normal speed: only then does time count. */
  listening: boolean
}

/** The listening state of the track in the player; reset() on every new track. */
export function createPlayTracker() {
  /** Seconds really listened to the current track. */
  let listened = 0
  /** Position at the previous update (null: no update yet, or after a reset). */
  let lastTime: number | null = null
  /** The play was reported. */
  let counted = false
  /** The completed play was reported. */
  let completed = false

  /** A new track (or the same one loaded again): start counting from zero. */
  function reset(): void {
    listened = 0
    lastTime = null
    counted = false
    completed = false
  }

  /** Takes a position update and says whether it made a play or a completed play. */
  function update({ time, duration, listening }: PlayTick): PlayEvent {
    // How far the position moved since the last update (0 on the first one).
    const step = lastTime === null ? 0 : time - lastTime
    lastTime = time
    // Forward, small and while playing: listening. Backwards, a jump or paused: not.
    if (listening && step > 0 && step <= MAX_STEP_SECONDS) listened += step

    // Half the track when it is short, otherwise the fixed threshold.
    const threshold = duration > 0 ? Math.min(PLAY_THRESHOLD_SECONDS, duration / 2) : PLAY_THRESHOLD_SECONDS
    if (!completed && duration > 0 && listened >= duration * COMPLETED_SHARE) {
      // A completed play is a play too (the server counts it as one).
      counted = true
      completed = true
      return 'completed'
    }
    if (!counted && listened >= threshold) {
      counted = true
      return 'play'
    }
    return null
  }

  return { reset, update }
}
