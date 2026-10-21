import { listTracks } from '../../services/tracks.service'

/**
 * GET /api/tracks — the user's library (lightweight data + signed cover URLs), newest first.
 * Auth: signed-in user (401 otherwise); only the user's own items are reachable.
 * 200 → TrackSummary[]
 */
export default defineEventHandler(async (event) => {
  const { db, userId } = await requireAuth(event)
  return listTracks(db, userId)
})
