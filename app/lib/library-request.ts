/**
 * The user's library (GET /api/tracks), read once for the callers that ask
 * while the app opens. Opening the app with a saved queue, the library page
 * (its list) and the queue restore (plugins/queue-persistence.client.ts,
 * matching the saved ids with the tracks that still exist) both ask for it,
 * and the whole library was read twice.
 *
 * - A read in progress is shared.
 * - The read made while the app opens is kept until the first page is on
 *   screen (endStartupRead): sharing only the read in progress depended on
 *   timing, since the restore asks first and its read (tens of ms) could
 *   answer before the page's code had even arrived (seen in CI).
 * - After that, once a read has answered the next call reads again, so a
 *   refresh of the list always sees the latest tracks.
 */
import type { TrackSummary } from '~~/shared/types/track'
import { tracksApi } from '~/services/api'

/** The read in progress, if any (cleared when it answers, success or failure). */
let inProgress: Promise<TrackSummary[]> | null = null
/** The read made while the app opens, handed to every caller until the first page is shown; null after that, or once it failed. */
let startupRead: Promise<TrackSummary[]> | null = null
/** The first page is on screen: reads are no longer kept. */
let startupOver = false

/** The library, newest first: the startup read or the read in progress if there is one, otherwise a new one. */
export function readLibrary(): Promise<TrackSummary[]> {
  if (startupRead) return startupRead
  inProgress ??= tracksApi.list().finally(() => {
    inProgress = null
  })
  if (!startupOver) {
    // This very read: its failure must not clear a later one.
    const read = inProgress
    startupRead = read
    // A failed read is not handed out again: the next caller asks anew.
    read.catch(() => {
      if (startupRead === read) startupRead = null
    })
  }
  return inProgress
}

/** The first page is on screen: the startup read is dropped and every later call reads afresh. */
export function endStartupRead(): void {
  startupOver = true
  startupRead = null
}
