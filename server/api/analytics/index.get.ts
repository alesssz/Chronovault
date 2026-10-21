import { analyticsQuerySchema } from '~~/shared/schemas/analytics'
import { getAnalyticsReport } from '../../services/analytics.service'

/**
 * GET /api/analytics?days=7|30 — visits to the user's share pages (/t/, /p/)
 * over the last 7 or 30 days (default 30): totals, per day, per item, and
 * by referrer, country and device.
 * Real data from Vercel Web Analytics when configured; demo data outside
 * Vercel; `source: 'unconfigured'` on Vercel without token (see the report's
 * `source` and server/utils/web-analytics.ts).
 * Auth: signed-in user (401 otherwise); only the user's own pages are counted.
 * 200 → AnalyticsReport · 400 invalid `days` · 502 Vercel Analytics failed
 */
export default defineEventHandler(async (event) => {
  const { db, userId } = await requireAuth(event)
  const { days } = readValidatedQuery(event, analyticsQuerySchema)
  return getAnalyticsReport(db, userId, days, useWebAnalyticsSource())
})
