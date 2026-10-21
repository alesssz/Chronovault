import { listGenres } from '../../services/genres.service'

/**
 * GET /api/genres — built-in genres + the user's custom genres, sorted by name.
 * Auth: signed-in user (401 otherwise); only the user's own items are reachable.
 * 200 → Genre[]
 */
export default defineEventHandler(async (event) => {
  const { db, userId } = await requireAuth(event)
  return listGenres(db, userId)
})
