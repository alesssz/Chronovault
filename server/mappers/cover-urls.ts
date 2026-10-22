/**
 * Cover addresses for the owner's library: stable, versioned URLs served by
 * the app (`/api/covers/…`) instead of Supabase signed URLs.
 *
 * Why: a signed URL carries a new token on every request, so the browser
 * sees a new image each time and downloads every cover again on every visit.
 * These URLs stay the same as long as the item does not change, and the
 * cover routes answer with a one-year browser cache: each cover is
 * downloaded once per device.
 *
 * The `v` parameter is the item's `updated_at` (base 36): a new cover (or any
 * edit of the item) gives a new URL, which the browser fetches fresh. The
 * server ignores it; it only exists to change the URL.
 *
 * Public share pages keep signed URLs: their visitors have no session the
 * cover routes could check.
 */

/** Short cache-busting version from an ISO timestamp. */
function version(updatedAt: string): string {
  const ms = Date.parse(updatedAt)
  return Number.isFinite(ms) ? ms.toString(36) : '0'
}

/** Address of a track's cover (served by server/api/covers/tracks/[id].get.ts). */
export function trackCoverUrl(trackId: string, updatedAt: string): string {
  return `/api/covers/tracks/${trackId}?v=${version(updatedAt)}`
}

/** Address of a playlist's custom cover (served by server/api/covers/playlists/[id].get.ts). */
export function playlistCoverUrl(playlistId: string, updatedAt: string): string {
  return `/api/covers/playlists/${playlistId}?v=${version(updatedAt)}`
}

/** The columns a cover address is built from (tracks and playlists alike). */
export interface CoverRow {
  id: string
  cover_path: string | null
  updated_at: string
}

/** A track row's cover address, or null when the track has no cover. */
export function trackCoverUrlOf(row: CoverRow): string | null {
  return row.cover_path ? trackCoverUrl(row.id, row.updated_at) : null
}

/** A playlist row's custom cover address, or null when it has none (the UI then shows the mosaic). */
export function playlistCoverUrlOf(row: CoverRow): string | null {
  return row.cover_path ? playlistCoverUrl(row.id, row.updated_at) : null
}
