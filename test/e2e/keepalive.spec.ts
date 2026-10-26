/**
 * End-to-end, the daily keep-alive (/api/keepalive) against the real local database: called
 * like Vercel Cron calls it (no session cookie), it gets through to Postgres as the anonymous
 * role and answers 200.
 */
import { expect, test } from './fixtures'

test.describe('keep-alive', () => {
  test('reaches the database without a session', async ({ request }) => {
    // The bare request fixture: no page, no sign-in, no cookies, like Vercel Cron.
    const response = await request.get('/api/keepalive')
    // 200 only if the query went through: a database error would answer 500.
    expect(response.status()).toBe(200)
    // Same shape as /api/health, with the time it ran (shown in the cron logs).
    const body = await response.json() as { status: string, time: string }
    expect(body.status).toBe('ok')
    expect(Number.isNaN(Date.parse(body.time))).toBe(false)
  })
})
