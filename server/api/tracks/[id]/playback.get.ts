import { getPlaybackSource } from '../../../services/tracks.service'

/** GET /api/tracks/:id/playback — time-limited signed URL for audio streaming. */
export default defineEventHandler(async (event) => {
  const { db, userId } = await requireAuth(event)
  return getPlaybackSource(db, useAudioStorage(), userId, requireUuidParam(event))
})
