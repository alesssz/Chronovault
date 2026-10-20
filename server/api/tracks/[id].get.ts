import { getTrack } from '../../services/tracks.service'

/** GET /api/tracks/:id — full detail (metadata, lyrics, peaks). */
export default defineEventHandler(async (event) => {
  const { db, userId } = await requireAuth(event)
  return getTrack(db, userId, requireUuidParam(event))
})
