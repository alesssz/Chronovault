import { getSharedPlaylistCoverUrl } from '../../../../services/sharing.service'

/**
 * GET /api/shared/playlists/:id/cover — redirects to a fresh signed URL of the
 * cover (the custom one, otherwise the first track cover). Used by link previews.
 * Auth: none (public). Private or missing items answer 404 alike.
 * 302 → signed cover URL (6 hours); 404 when there is no cover.
 */
export default defineEventHandler(async (event) => {
  // A signed URL of the playlist's cover, through the visitor's client (404 when private, missing or without any cover).
  const url = await getSharedPlaylistCoverUrl(await visitorClient(event), requireUuidParam(event))
  return sendRedirect(event, url, 302)
})
