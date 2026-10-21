/**
 * Which pages Vercel Web Analytics may count (plugins/web-analytics.client.ts):
 * only the public share pages, /t/<track id> and /p/<playlist id>.
 * Their paths are exactly what the Statistics page queries.
 */
const SHARE_PAGE = /^\/[tp]\/[^/]+$/

/** True for a share page path (`/t/<id>`, `/p/<id>`); a trailing slash or a sub-path is not one. */
export function isSharePagePath(pathname: string): boolean {
  return SHARE_PAGE.test(pathname)
}
