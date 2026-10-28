import { playlistCreateSchema } from '~~/shared/schemas/playlist'
import { createPlaylist } from '../../services/playlists.service'

/**
 * POST /api/playlists — creates a playlist, optionally with its first tracks.
 * Auth: signed-in user (401 otherwise); only the user's own items are reachable.
 * Body: playlistCreateSchema. 201 → PlaylistDetail; 400 invalid body;
 * 404 when a track id is not one of the user's tracks (missing or someone else's).
 */
export default defineEventHandler(async (event) => {
  // The signed-in user, and a database client acting as them (RLS applies); 401 without a session.
  const { db, userId } = await requireAuth(event)
  // The request body, validated against the schema (400 otherwise).
  const input = await readValidated(event, playlistCreateSchema)
  setResponseStatus(event, 201)
  return createPlaylist(db, userId, input)
})
