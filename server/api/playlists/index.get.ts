import { playlistListQuerySchema } from '~~/shared/schemas/playlist'
import { listPlaylists } from '../../services/playlists.service'

/**
 * GET /api/playlists?purpose=playlist|versions — the user's playlists of one
 * purpose (summaries + cover addresses), newest first. Without `purpose`: the
 * curated playlists ('playlist'); `versions` lists the groups of versions
 * made by "Share for feedback".
 * Auth: signed-in user (401 otherwise); only the user's own items are reachable.
 * 200 → PlaylistSummary[] · 400 invalid `purpose`
 */
export default defineEventHandler(async (event) => {
  // The signed-in user, and a database client acting as them (RLS applies); 401 without a session.
  const { db, userId } = await requireAuth(event)
  // The query string, validated against the schema (400 otherwise).
  const { purpose } = readValidatedQuery(event, playlistListQuerySchema)
  return listPlaylists(db, userId, purpose)
})
