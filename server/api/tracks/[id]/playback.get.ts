import { getPlaybackSource } from '../../../services/tracks.service'

/**
 * GET /api/tracks/:id/playback — time-limited signed URL for audio streaming.
 * Auth: signed-in user (401 otherwise); only the user's own items are reachable.
 * 200 → PlaybackSource { url, expiresAt } (6 hours); 404.
 */
export default defineEventHandler(async (event) => {
  // The signed-in user, and a database client acting as them (RLS applies); 401 without a session.
  const { db, userId } = await requireAuth(event)
  return getPlaybackSource(db, useAudioStorage(), userId, requireUuidParam(event))
})
