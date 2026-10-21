import { getSharedCoverUrl } from '../../../services/sharing.service'

/**
 * GET /api/shared/:id/cover — redirects to a fresh signed URL of the cover.
 * Social previews (og:image) point here, so the address never expires.
 * Auth: none (public). Private or missing items answer 404 alike.
 * 302 → signed cover URL (6 hours); 404 when there is no cover.
 */
export default defineEventHandler(async (event) => {
  const url = await getSharedCoverUrl(await visitorClient(event), requireUuidParam(event))
  return sendRedirect(event, url, 302)
})
