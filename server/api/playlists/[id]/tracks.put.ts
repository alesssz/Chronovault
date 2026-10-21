import { playlistTracksSchema } from '~~/shared/schemas/playlist'
import { setPlaylistTracks } from '../../../services/playlists.service'

/**
 * PUT /api/playlists/:id/tracks — replaces the tracks, in order (reorder and
 * remove), in one database transaction.
 * Auth: signed-in user (401 otherwise); only the user's own items are reachable.
 * Body: { trackIds } (distinct, ≤ 1000). 200 → PlaylistDetail; 400; 403 foreign track; 404.
 */
export default defineEventHandler(async (event) => {
  const { db, userId } = await requireAuth(event)
  const id = requireUuidParam(event)
  const { trackIds } = await readValidated(event, playlistTracksSchema)
  return setPlaylistTracks(db, userId, id, trackIds)
})
