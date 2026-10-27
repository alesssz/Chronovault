/**
 * The user's library (GET /api/tracks), read once for the callers that ask
 * at the same moment. Opening the app with a saved queue, the library page
 * (its list) and the queue restore (plugins/queue-persistence.client.ts,
 * matching the saved ids with the tracks that still exist) both asked for it,
 * and the whole library was read twice. A read in progress is now shared;
 * once it has answered, the next call reads again, so a refresh of the list
 * always sees the latest tracks.
 */
import type { TrackSummary } from '~~/shared/types/track'
import { tracksApi } from '~/services/api'

/** The read in progress, if any (cleared when it answers, success or failure). */
let inProgress: Promise<TrackSummary[]> | null = null

/** The library, newest first: the read in progress if there is one, otherwise a new one. */
export function readLibrary(): Promise<TrackSummary[]> {
  inProgress ??= tracksApi.list().finally(() => {
    inProgress = null
  })
  return inProgress
}
