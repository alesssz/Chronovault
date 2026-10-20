import { listGenres } from '../../services/genres.service'

/** GET /api/genres — built-in genres + the user's custom genres. */
export default defineEventHandler(async (event) => {
  const { db, userId } = await requireAuth(event)
  return listGenres(db, userId)
})
