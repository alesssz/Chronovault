import { createError } from 'h3'
import { z } from 'zod'

/**
 * Client for the Vercel Web Analytics API (read side): page views and
 * visitors that the analytics script recorded on the deployed site.
 *
 * Only the "aggregate" endpoint is used:
 *   GET https://api.vercel.com/v1/query/web-analytics/visits/aggregate
 *     ?projectId&teamId?&since&until&by&filter&limit
 * It counts page views (and unique visitors) in a date range, grouped by one
 * dimension: a time step (`day`) or a property (`requestPath`, `country`…).
 * Docs: https://vercel.com/docs/analytics/web-analytics-api
 *
 * The access token is a Vercel account token: it never leaves the server
 * (runtime config, like the R2 keys), and error responses never echo it.
 */

export interface WebAnalyticsConfig {
  /** Vercel access token (Account settings → Tokens). */
  token: string
  /** The project id (`prj_…`) or name. */
  projectId: string
  /** Only for projects owned by a team; empty for a personal account. */
  teamId: string
}

/** Grouping dimensions used by Chronovault (the API supports more). */
export type WebAnalyticsDimension = 'day' | 'environment' | 'requestPath' | 'referrerHostname' | 'country' | 'deviceType'

/** One aggregated row: the group's value (or the day) and its counts. */
export interface WebAnalyticsRow {
  /** Value of the grouping dimension; for `day`, the day's ISO timestamp. Null when unknown. */
  key: string | null
  pageviews: number
  visitors: number
}

/** One aggregate query. */
export interface WebAnalyticsQuery {
  by: WebAnalyticsDimension
  /** First and last day, `YYYY-MM-DD`, both included. */
  since: string
  until: string
  /** OData filter, e.g. `requestPath in ('/t/…', '/p/…')`. */
  filter?: string
  /** Distinct groups returned (1-100, default 10); the rest are grouped into "Others". */
  limit?: number
}

const API_URL = 'https://api.vercel.com/v1/query/web-analytics/visits/aggregate'

/**
 * The parts of the response that are read. Rows are loose objects: the
 * grouping dimension is a property named after it (`country: 'IT'`), time
 * steps have a `timestamp`. Counts are coerced, in case they come as strings.
 */
const responseSchema = z.object({
  data: z.array(z.record(z.string(), z.unknown())),
})

/** A count from the response: a non-negative number, 0 when missing or malformed. */
function count(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** Reads Vercel Web Analytics data for one project. */
export class WebAnalyticsClient {
  /**
   * @param config token and project (server-only)
   * @param fetchImpl injectable for tests (test/unit/server/web-analytics.test.ts)
   */
  constructor(
    private readonly config: WebAnalyticsConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  /**
   * Runs one aggregate query and returns its rows.
   * Failures become a 502 with a message safe to show (never the token):
   * 401/403 mean a wrong or expired token, 402 a plan without the feature.
   */
  async aggregate(query: WebAnalyticsQuery): Promise<WebAnalyticsRow[]> {
    const params = new URLSearchParams({
      projectId: this.config.projectId,
      since: query.since,
      until: query.until,
      by: query.by,
      limit: String(query.limit ?? 10),
    })
    if (this.config.teamId) params.set('teamId', this.config.teamId)
    if (query.filter) params.set('filter', query.filter)

    // The response, or the network failure that prevented it.
    let response: Response
    try {
      response = await this.fetchImpl(`${API_URL}?${params}`, {
        headers: { authorization: `Bearer ${this.config.token}` },
      })
    }
    catch (err) {
      console.error('[web-analytics] request failed', err)
      throw unavailable('Vercel Analytics could not be reached')
    }

    if (!response.ok) {
      // The body may explain the error; it is logged, not returned.
      console.error(`[web-analytics] ${response.status}`, await response.text().catch(() => ''))
      if (response.status === 401 || response.status === 403) {
        throw unavailable('Vercel Analytics refused the access token: check NUXT_ANALYTICS_TOKEN')
      }
      if (response.status === 402) throw unavailable('Web Analytics is not available on this Vercel plan')
      throw unavailable(`Vercel Analytics answered ${response.status}`)
    }

    const parsed = responseSchema.safeParse(await response.json().catch(() => null))
    if (!parsed.success) {
      console.error('[web-analytics] unexpected response', parsed.error)
      throw unavailable('Unexpected answer from Vercel Analytics')
    }
    // Time steps carry their date in `timestamp`, other groups in a property named after the dimension.
    const keyField = query.by === 'day' ? 'timestamp' : query.by
    return parsed.data.data.map((row) => {
      const key = row[keyField]
      return {
        key: typeof key === 'string' && key !== '' ? key : null,
        pageviews: count(row.pageviews),
        visitors: count(row.visitors),
      }
    })
  }
}

/** 502: the statistics depend on an outside service that failed. */
function unavailable(message: string) {
  return createError({ statusCode: 502, statusMessage: 'Bad Gateway', message })
}
