import { deleteTrack } from '../../services/tracks.service'

/** DELETE /api/tracks/:id — deletes the track and its files. */
export default defineEventHandler(async (event) => {
  const { db, userId } = await requireAuth(event)
  await deleteTrack(db, userId, requireUuidParam(event))
  setResponseStatus(event, 204)
  return null
})
