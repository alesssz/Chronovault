import { getSharedCoverUrl } from '../../../services/sharing.service'

/**
 * GET /api/shared/:id/cover — redirects to a fresh signed URL of the cover.
 * Social previews (og:image) point here, so the address never expires.
 */
export default defineEventHandler(async (event) => {
  const url = await getSharedCoverUrl(await visitorClient(event), requireUuidParam(event))
  return sendRedirect(event, url, 302)
})
