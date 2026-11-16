import { setResponseHeaders, type H3Event } from 'h3'
import type { CoverImageFile } from '../services/covers.service'

/**
 * Browser cache of cover responses: one year, never revalidated.
 *
 * - `private`: only the user's browser may keep it, never a shared cache or
 *   CDN (covers are personal; the route checks the session).
 * - `immutable`: the URL changes whenever the cover can have changed (its
 *   `v` parameter), so a cached copy never needs checking again.
 *
 * It overrides the `no-store` that routeRules sets on every /api route.
 */
const COVER_CACHE_CONTROL = 'private, max-age=31536000, immutable'

/** Sends a cover image with long-lived browser caching (auto-imported by Nitro). */
export function sendCover(event: H3Event, cover: CoverImageFile): Uint8Array {
  setResponseHeaders(event, {
    'content-type': cover.contentType,
    'content-length': cover.bytes.length,
    'cache-control': COVER_CACHE_CONTROL,
  })
  return cover.bytes
}
