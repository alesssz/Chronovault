import { playlistTracksSchema } from '~~/shared/schemas/playlist'
import { addPlaylistTracks } from '../../../services/playlists.service'

/**
 * POST /api/playlists/:id/tracks — appends tracks; those already in the
 * playlist are skipped (they keep their position).
 * Auth: signed-in user (401 otherwise); only the user's own items are reachable.
 * Body: { trackIds }. 200 → PlaylistDetail; 400 (e.g. over 1000 tracks); 403; 404.
 */
export default defineEventHandler(async (event) => {
  const { db, userId } = await requireAuth(event)
  const id = requireUuidParam(event)
  const { trackIds } = await readValidated(event, playlistTracksSchema)
  return addPlaylistTracks(db, userId, id, trackIds)
})
