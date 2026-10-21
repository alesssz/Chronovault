import { playlistCreateSchema } from '~~/shared/schemas/playlist'
import { createPlaylist } from '../../services/playlists.service'

/** POST /api/playlists — creates a playlist, optionally with its first tracks. */
export default defineEventHandler(async (event) => {
  const { db, userId } = await requireAuth(event)
  const input = await readValidated(event, playlistCreateSchema)
  setResponseStatus(event, 201)
  return createPlaylist(db, userId, input)
})
