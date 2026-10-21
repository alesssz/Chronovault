import { playlistTracksSchema } from '~~/shared/schemas/playlist'
import { addPlaylistTracks } from '../../../services/playlists.service'

/** POST /api/playlists/:id/tracks — appends tracks (those already in it are skipped). */
export default defineEventHandler(async (event) => {
  const { db, userId } = await requireAuth(event)
  const id = requireUuidParam(event)
  const { trackIds } = await readValidated(event, playlistTracksSchema)
  return addPlaylistTracks(db, userId, id, trackIds)
})
