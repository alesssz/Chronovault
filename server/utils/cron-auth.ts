import { createHash, timingSafeEqual } from 'node:crypto'
import { createError, getHeader, type H3Event } from 'h3'

/**
 * Who may call the routes Vercel Cron calls (`/api/keepalive`).
 *
 * With `CRON_SECRET` set in the project's environment, Vercel Cron sends it
 * as `Authorization: Bearer <secret>`, and only that request gets through.
 * The secret guards the invocations and database queries a stranger could
 * otherwise spend in a loop, not data.
 *
 * Read from `process.env` on each request, not from runtimeConfig: Vercel
 * fixes the variable's name, and runtimeConfig takes only `NUXT_` variables
 * at run time; a value it read at build time would be written into the
 * server bundle.
 */

/** What a cron route should do with a request. */
export type CronAccess = 'allowed' | 'refused' | 'unconfigured'

/**
 * The decision, apart from the request. Without a secret the route stays
 * open outside Vercel (development, the e2e tests, Docker), but not on a
 * Vercel deployment: there a missing variable is a mistake, and an open
 * route would hide it.
 */
export function cronAccess(authorization: string | undefined, secret: string | undefined, onVercel: boolean): CronAccess {
  if (!secret) return onVercel ? 'unconfigured' : 'allowed'
  return authorization !== undefined && sameText(authorization, `Bearer ${secret}`) ? 'allowed' : 'refused'
}

/** Equal texts, compared in constant time: the digests have one length, so neither the length nor the first differing character shows in the timing. */
function sameText(a: string, b: string): boolean {
  const digest = (text: string) => createHash('sha256').update(text).digest()
  return timingSafeEqual(digest(a), digest(b))
}

/** Lets the request through, or answers 401 (wrong or missing secret) or 500 (no secret set on Vercel). */
export function requireCronSecret(event: H3Event): void {
  const access = cronAccess(getHeader(event, 'authorization'), process.env.CRON_SECRET, Boolean(process.env.VERCEL))
  if (access === 'allowed') return
  if (access === 'unconfigured') {
    console.error('[cron.auth] CRON_SECRET is not set: the cron routes refuse every call')
    throw createError({ statusCode: 500, statusMessage: 'Internal Server Error', message: 'Not configured' })
  }
  throw createError({ statusCode: 401, statusMessage: 'Unauthorized', message: 'Cron secret required' })
}
