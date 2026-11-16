import { playlistTracksSchema } from '~~/shared/schemas/playlist'
import { addPlaylistTracks } from '../../../services/playlists.service'

/**
 * POST /api/playlists/:id/tracks — appends tracks; those already in the
 * playlist are skipped (they keep their position).
 * Auth: signed-in user (401 otherwise); only the user's own items are reachable.
 * Body: { trackIds }. 200 → PlaylistDetail; 400 (e.g. over 1000 tracks); 404 for a playlist or
 * a track that is not the user's (missing or someone else's), nothing written.
 */
export default defineEventHandler(async (event) => {
  const { db, userId } = await requireAuth(event)
  const id = requireUuidParam(event)
  const { trackIds } = await readValidated(event, playlistTracksSchema)
  return addPlaylistTracks(db, userId, id, trackIds)
})
