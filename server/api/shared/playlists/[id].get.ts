import { getSharedPlaylist } from '../../../services/sharing.service'

/** GET /api/shared/playlists/:id — public data of an unlisted/public playlist and its tracks. */
export default defineEventHandler(async (event) => {
  return getSharedPlaylist(await visitorClient(event), requireUuidParam(event))
})
