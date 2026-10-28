import { getListenerId } from '~/lib/listener-id'
import { createPlayTracker } from '~/lib/play-tracker'
import { playsApi } from '~/services/api'

/**
 * Counts plays: follows the player's position and, once a track has really
 * been listened to (app/lib/play-tracker.ts), tells the server (POST
 * /api/plays), then again when it has been listened to the end.
 *
 * Every player counts: the share pages (visitors' plays, the reason for all
 * this) and the owner's library (own plays, which the server recognises by
 * the session and keeps apart). Slowed-down playback in the lyrics sync
 * editor does not count: that is editing, not listening.
 *
 * Best effort: a failed report (offline, ad blocker) is simply lost, and
 * never bothers the listener. `.client`: browser only.
 */
export default defineNuxtPlugin(() => {
  // The position, status and context of what is playing.
  const player = usePlayerStore()
  // How much of the current track has been listened to.
  const tracker = createPlayTracker()

  // A new track, the same track in another context (a share page took the
  // player over), or the same track starting over (repeat one, play pressed
  // after its end: `listen`): counting starts again, so each listen is
  // measured on its own (before, a replay went on adding to the first one's
  // time and could make two halves a "completed" play). The server keeps one
  // row per listener, track and day (plays_once_a_day): the same day a new
  // listen can only mark it completed, another day it is a new play.
  // Declared before the position watcher, so on a change the reset runs first.
  watch([() => player.current?.id, () => player.sourceKey, () => player.listen], () => tracker.reset())

  // Every position update (each animation frame while playing).
  watch(() => player.currentTime, (time) => {
    // The loaded track (nothing to count without one).
    const track = player.current
    if (!track) return
    // Whether this update makes a play, or a completed one (at most once each per listen).
    const event = tracker.update({
      time,
      duration: player.duration,
      listening: player.status === 'playing' && player.playbackRate === 1,
    })
    if (event) report(track.id, event === 'completed')
  })

  /** Sends a play (or a completed one) for `trackId`, in the current context. */
  function report(trackId: string, completed: boolean) {
    playsApi
      .record({ trackId, playlistId: playlistIdOf(player.sourceKey), listenerId: getListenerId(), completed })
      // Not counted (an error, or 429 past the daily cap of visitors), nothing else to do: the listener must never notice.
      .catch(() => {})
  }
})

/** The shared playlist being played ('playlist:<id>' source), or null (library, track page). */
function playlistIdOf(sourceKey: string): string | null {
  return sourceKey.startsWith('playlist:') ? sourceKey.slice('playlist:'.length) : null
}
