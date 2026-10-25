import { getPlaylistCover } from '../../../services/covers.service'

/**
 * GET /api/covers/playlists/:id?v=<version> — the custom cover of one of
 * the user's playlists, cached by the browser for a year (see the track route).
 * Auth: signed-in user (401 otherwise); only the user's own playlists.
 * 200 → image (WebP); 404 no custom cover, or not the user's playlist.
 */
export default defineEventHandler(async (event) => {
  // The signed-in user, and a database client acting as them (RLS applies); 401 without a session.
  const { db, userId } = await requireAuth(event)
  return sendCover(event, await getPlaylistCover(db, userId, requireUuidParam(event)))
})
