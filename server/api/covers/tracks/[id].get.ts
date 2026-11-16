import { getTrackCover } from '../../../services/covers.service'

/**
 * GET /api/covers/tracks/:id?v=<version> — the cover image of one of the
 * user's tracks, cached by the browser for a year (the `v` parameter changes
 * with the track, so a new cover gets a new address; the server ignores it).
 * Auth: signed-in user (401 otherwise); only the user's own tracks.
 * 200 → image (WebP); 404 no cover, or not the user's track.
 */
export default defineEventHandler(async (event) => {
  const { db, userId } = await requireAuth(event)
  return sendCover(event, await getTrackCover(db, userId, requireUuidParam(event)))
})
