import { listPlaylists } from '../../services/playlists.service'

/** GET /api/playlists — the user's playlists (summaries + signed cover URLs). */
export default defineEventHandler(async (event) => {
  const { db, userId } = await requireAuth(event)
  return listPlaylists(db, userId)
})
