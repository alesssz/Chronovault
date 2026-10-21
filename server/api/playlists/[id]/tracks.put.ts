import { playlistTracksSchema } from '~~/shared/schemas/playlist'
import { setPlaylistTracks } from '../../../services/playlists.service'

/** PUT /api/playlists/:id/tracks — replaces the tracks, in order (reorder and remove). */
export default defineEventHandler(async (event) => {
  const { db, userId } = await requireAuth(event)
  const id = requireUuidParam(event)
  const { trackIds } = await readValidated(event, playlistTracksSchema)
  return setPlaylistTracks(db, userId, id, trackIds)
})
