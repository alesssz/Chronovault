import { playlistUpdateSchema } from '~~/shared/schemas/playlist'
import { updatePlaylist } from '../../services/playlists.service'

/** PATCH /api/playlists/:id — updates title, description, visibility or cover. */
export default defineEventHandler(async (event) => {
  const { db, userId } = await requireAuth(event)
  const id = requireUuidParam(event)
  const input = await readValidated(event, playlistUpdateSchema)
  return updatePlaylist(db, userId, id, input)
})
