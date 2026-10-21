import { getSharedPlaylist } from '../../../services/sharing.service'

/**
 * GET /api/shared/playlists/:id — public data of an unlisted/public playlist
 * and all its tracks (private ones included: sharing a playlist shares its content).
 * Auth: none (public). Private or missing items answer 404 alike.
 * 200 → SharedPlaylist; 404.
 */
export default defineEventHandler(async (event) => {
  return getSharedPlaylist(await visitorClient(event), requireUuidParam(event))
})
