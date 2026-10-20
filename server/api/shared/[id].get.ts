import { getSharedTrack } from '../../services/sharing.service'

/** GET /api/shared/:id — public data of an unlisted/public track (no sign-in needed). */
export default defineEventHandler(async (event) => {
  return getSharedTrack(await visitorClient(event), requireUuidParam(event))
})
