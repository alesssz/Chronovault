import { listTracks } from '../../services/tracks.service'

/** GET /api/tracks — the user's library (lightweight data + signed cover URLs). */
export default defineEventHandler(async (event) => {
  const { db, userId } = await requireAuth(event)
  return listTracks(db, userId)
})
