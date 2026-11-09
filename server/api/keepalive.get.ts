import { pingDatabase } from '../repositories/keepalive.repository'

/**
 * GET /api/keepalive — runs one tiny database query, so the Supabase
 * project never looks idle. Supabase pauses a Free-plan project after a week
 * without database activity (sign-in, library and share links stop working
 * until it is restored by hand); Vercel Cron calls this once a day
 * (vercel.json). /api/health cannot do it: it never reaches the database.
 *
 * Auth: none, on purpose. It runs as the anonymous role and reads one
 * genre, which anyone holding the public Supabase key can already
 * read straight from Supabase: a secret would protect nothing.
 * 200 → { status: "ok", time: ISO timestamp } · 500 when the database does not answer
 */
export default defineEventHandler(async (event) => {
  // No session cookie on a cron request: the anonymous role.
  await pingDatabase(await visitorClient(event))
  return { status: 'ok', time: new Date().toISOString() }
})
