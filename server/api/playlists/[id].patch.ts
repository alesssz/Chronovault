import { playlistUpdateSchema } from '~~/shared/schemas/playlist'
import { updatePlaylist } from '../../services/playlists.service'

/**
 * PATCH /api/playlists/:id — updates title, description, visibility or cover
 * (`coverPath: null` removes the custom cover and deletes the file).
 * Auth: signed-in user (401 otherwise); only the user's own items are reachable.
 * Body: playlistUpdateSchema. 200 → PlaylistDetail; 400; 404.
 */
export default defineEventHandler(async (event) => {
  // The signed-in user, and a database client acting as them (RLS applies); 401 without a session.
  const { db, userId } = await requireAuth(event)
  // The id in the address (400 when it is not a UUID).
  const id = requireUuidParam(event)
  // The request body, validated against the schema (400 otherwise).
  const input = await readValidated(event, playlistUpdateSchema)
  return updatePlaylist(db, userId, id, input)
})
