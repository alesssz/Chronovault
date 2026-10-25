import { z } from 'zod'
import { ANALYTICS_PERIODS, type AnalyticsPeriod } from '../types/analytics'

/**
 * Query of GET /api/analytics: `?days=7` or `?days=30` (default 30).
 * Query values arrive as strings, hence the string enum turned into a number.
 */
export const analyticsQuerySchema = z.object({
  days: z
    .enum(ANALYTICS_PERIODS.map(String) as [string, ...string[]])
    .default('30')
    .transform(value => Number(value) as AnalyticsPeriod),
})

/** The validated query: `days` as a number (7 or 30). */
export type AnalyticsQuery = z.output<typeof analyticsQuerySchema>
