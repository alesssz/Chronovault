import { listPlaylists } from '../../services/playlists.service'

/**
 * GET /api/playlists — the user's playlists (summaries + signed cover URLs), newest first.
 * Auth: signed-in user (401 otherwise); only the user's own items are reachable.
 * 200 → PlaylistSummary[]
 */
export default defineEventHandler(async (event) => {
  const { db, userId } = await requireAuth(event)
  return listPlaylists(db, userId)
})
