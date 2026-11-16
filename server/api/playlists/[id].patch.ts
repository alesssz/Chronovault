import { playlistUpdateSchema } from '~~/shared/schemas/playlist'
import { updatePlaylist } from '../../services/playlists.service'

/**
 * PATCH /api/playlists/:id — updates title, description, visibility or cover
 * (`coverPath: null` removes the custom cover and deletes the file).
 * Auth: signed-in user (401 otherwise); only the user's own items are reachable.
 * Body: playlistUpdateSchema. 200 → PlaylistDetail; 400; 404.
 */
export default defineEventHandler(async (event) => {
  const { db, userId } = await requireAuth(event)
  const id = requireUuidParam(event)
  const input = await readValidated(event, playlistUpdateSchema)
  return updatePlaylist(db, userId, id, input)
})
