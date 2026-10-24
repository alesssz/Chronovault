import { analyticsQuerySchema } from '~~/shared/schemas/analytics'
import { getPlaysReport } from '../../services/plays.service'

/**
 * GET /api/analytics/plays?days=7|30 — plays of the user's tracks over the
 * last 7 or 30 days (default 30): visitors' plays in total, per day and per
 * share page, and the user's own plays apart. Counted by the app itself
 * (table `plays`): real numbers everywhere, unlike the page views of
 * GET /api/analytics, which only Vercel has.
 * Auth: signed-in user (401 otherwise); only the user's own tracks are counted.
 * 200 → PlaysReport · 400 invalid `days`
 */
export default defineEventHandler(async (event) => {
  const { db, userId } = await requireAuth(event)
  const { days } = readValidatedQuery(event, analyticsQuerySchema)
  return getPlaysReport(db, userId, days)
})
