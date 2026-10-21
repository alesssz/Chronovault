import { playlistCreateSchema } from '~~/shared/schemas/playlist'
import { createPlaylist } from '../../services/playlists.service'

/**
 * POST /api/playlists — creates a playlist, optionally with its first tracks.
 * Auth: signed-in user (401 otherwise); only the user's own items are reachable.
 * Body: playlistCreateSchema. 201 → PlaylistDetail; 400 invalid body;
 * 403 when a track id is not one of the user's tracks.
 */
export default defineEventHandler(async (event) => {
  const { db, userId } = await requireAuth(event)
  const input = await readValidated(event, playlistCreateSchema)
  setResponseStatus(event, 201)
  return createPlaylist(db, userId, input)
})
