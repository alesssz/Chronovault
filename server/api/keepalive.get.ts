import { pingDatabase } from '../repositories/keepalive.repository'

/**
 * GET /api/keepalive — runs one tiny database query, so the Supabase
 * project never looks idle. Supabase pauses a Free-plan project after a week
 * without database activity (sign-in, library and share links stop working
 * until it is restored by hand); Vercel Cron calls this once a day
 * (vercel.json). /api/health cannot do it: it never reaches the database.
 *
 * Auth: the cron secret (requireCronSecret), not a session. The query
 * itself runs as the anonymous role and reads one genre.
 * 200 → { status: "ok", time: ISO timestamp } · 401 without the secret ·
 * 500 when the database does not answer, or on Vercel without CRON_SECRET
 */
export default defineEventHandler(async (event) => {
  requireCronSecret(event)
  // No session cookie on a cron request: the anonymous role.
  await pingDatabase(await visitorClient(event))
  return { status: 'ok', time: new Date().toISOString() }
})
