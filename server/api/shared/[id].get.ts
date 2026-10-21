import { getSharedTrack } from '../../services/sharing.service'

/**
 * GET /api/shared/:id — public data of an unlisted/public track (no sign-in needed).
 * Auth: none (public). Private or missing items answer 404 alike.
 * 200 → SharedTrack (no Suno prompt, mastering status or storage paths); 404.
 */
export default defineEventHandler(async (event) => {
  return getSharedTrack(await visitorClient(event), requireUuidParam(event))
})
