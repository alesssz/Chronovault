import { getSharedPlaylistCoverUrl } from '../../../../services/sharing.service'

/**
 * GET /api/shared/playlists/:id/cover — redirects to a fresh signed URL of the
 * cover (the custom one, otherwise the first track cover). Used by link previews.
 */
export default defineEventHandler(async (event) => {
  const url = await getSharedPlaylistCoverUrl(await visitorClient(event), requireUuidParam(event))
  return sendRedirect(event, url, 302)
})
