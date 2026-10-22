import type {
  AnalyticsBreakdownRow,
  AnalyticsCount,
  AnalyticsItem,
  AnalyticsPeriod,
  AnalyticsReport,
} from '~~/shared/types/analytics'
import type { DbClient } from '../utils/auth'
import type { WebAnalyticsSource } from '../utils/web-analytics'
import type { WebAnalyticsClient, WebAnalyticsDimension, WebAnalyticsRow } from '../repositories/web-analytics'
import * as tracksRepo from '../repositories/tracks.repository'
import * as playlistsRepo from '../repositories/playlists.repository'
import { playlistCoverUrlOf, trackCoverUrlOf } from '../mappers/cover-urls'
import { demoNumbers } from './analytics-demo'

/**
 * Visit statistics of the user's share pages (Statistics page).
 *
 * Vercel Web Analytics counts page views of the whole site; a user must only
 * see the visits to *their* public pages. So the queries are filtered on the
 * exact paths of the user's tracks (/t/<id>) and playlists (/p/<id>): every
 * one of them, shared or not, because a page made private again keeps the
 * visits it had while shared.
 *
 * Only page views exist (opening a share page), not plays: custom events
 * such as "play" are not part of Vercel's Hobby plan.
 */

/** Paths per query: the API filter is limited to 2048 characters (a path takes ~43). */
export const PATHS_PER_QUERY = 40
/** Values listed in each breakdown (referrers, countries, devices); the rest becomes "Others". */
export const BREAKDOWN_SIZE = 8
/** The group in which the API (and this service) puts the values beyond the top ones. */
const OTHERS = 'Others'

/** No visits: the starting point of every sum (a new object each time, safe to mutate). */
export function zeroCount(): AnalyticsCount {
  return { pageviews: 0, visitors: 0 }
}

/** A track or playlist whose public page may have visits. */
export type AnalyticsTarget = Omit<AnalyticsItem, keyof AnalyticsCount>

/** The days of a period: first, last (both included) and every day in between, `YYYY-MM-DD`, UTC. */
export interface AnalyticsPeriodDays {
  since: string
  until: string
  dates: string[]
}

/** The `days` days ending today (UTC), today included. */
export function periodOf(days: AnalyticsPeriod, today: Date): AnalyticsPeriodDays {
  const dates = Array.from({ length: days }, (_, i) => {
    // i = 0 is the oldest day; Date.UTC handles month and year boundaries.
    const day = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - (days - 1 - i)))
    return day.toISOString().slice(0, 10)
  })
  return { since: dates[0]!, until: dates.at(-1)!, dates }
}

/**
 * The statistics report for the last `days` days.
 * @param source real data (Vercel), demo numbers, or nothing (not configured)
 * @param today injectable for tests
 */
export async function getAnalyticsReport(
  db: DbClient,
  userId: string,
  days: AnalyticsPeriod,
  source: WebAnalyticsSource,
  today = new Date(),
): Promise<AnalyticsReport> {
  const period = periodOf(days, today)
  // Fields every report has, whatever the source.
  const base = { days, since: period.since, until: period.until }
  if (source.kind === 'unconfigured') return { source: 'unconfigured', ...base, ...emptyNumbers(period) }

  const targets = await listTargets(db, userId)
  if (source.kind === 'demo') return { source: 'demo', ...base, ...demoNumbers(targets, period) }
  return { source: 'vercel', ...base, ...await vercelNumbers(source.client, targets, period) }
}

/** Every track and playlist of the user, with its public page path. */
async function listTargets(db: DbClient, userId: string): Promise<AnalyticsTarget[]> {
  const [tracks, playlists] = await Promise.all([
    tracksRepo.listTrackLabels(db, userId),
    playlistsRepo.listPlaylistLabels(db, userId),
  ])
  return [
    ...tracks.map(t => ({
      kind: 'track' as const,
      id: t.id,
      title: t.title,
      visibility: t.visibility,
      coverUrl: trackCoverUrlOf(t),
      path: `/t/${t.id}`,
    })),
    ...playlists.map(p => ({
      kind: 'playlist' as const,
      id: p.id,
      title: p.title,
      visibility: p.visibility,
      coverUrl: playlistCoverUrlOf(p),
      path: `/p/${p.id}`,
    })),
  ]
}

/** The numbers part of a report (what the source provides). */
export type AnalyticsNumbers = Pick<AnalyticsReport, 'totals' | 'daily' | 'items' | 'referrers' | 'countries' | 'devices'>

/** A report with no visits: zero totals, every day at zero. */
function emptyNumbers(period: AnalyticsPeriodDays): AnalyticsNumbers {
  return {
    totals: zeroCount(),
    daily: period.dates.map(date => ({ date, ...zeroCount() })),
    items: [],
    referrers: [],
    countries: [],
    devices: [],
  }
}

/** One group of queries: every breakdown, for the same paths. */
const QUERIES: { by: WebAnalyticsDimension, limit: number }[] = [
  // A single row: the period's total (unique visitors over the whole period).
  { by: 'environment', limit: 1 },
  { by: 'day', limit: 100 },
  { by: 'requestPath', limit: 100 },
  { by: 'referrerHostname', limit: 10 },
  { by: 'country', limit: 10 },
  { by: 'deviceType', limit: 10 },
]

/**
 * Real numbers from Vercel. The paths are queried in groups of
 * PATHS_PER_QUERY (filter length limit); the groups' rows are then summed.
 * With more than one group, unique visitors are summed too, so a person who
 * opened pages of two groups counts twice: an acceptable approximation.
 */
async function vercelNumbers(
  client: WebAnalyticsClient,
  targets: AnalyticsTarget[],
  period: AnalyticsPeriodDays,
): Promise<AnalyticsNumbers> {
  if (!targets.length) return emptyNumbers(period)

  // One result list per query kind, filled by every group.
  const results = new Map<WebAnalyticsDimension, WebAnalyticsRow[]>(QUERIES.map(q => [q.by, []]))
  for (let start = 0; start < targets.length; start += PATHS_PER_QUERY) {
    const paths = targets.slice(start, start + PATHS_PER_QUERY).map(t => `'${t.path}'`)
    // Production only: preview deployments are tests, not real visitors.
    const filter = `environment eq 'production' and requestPath in (${paths.join(', ')})`
    const groupRows = await Promise.all(QUERIES.map(q =>
      client.aggregate({ by: q.by, limit: q.limit, since: period.since, until: period.until, filter })))
    QUERIES.forEach((q, i) => results.get(q.by)!.push(...groupRows[i]!))
  }

  const totals = sumRows(results.get('environment')!)
  // Day rows carry an ISO timestamp: keep the date part.
  const byDay = groupSum(results.get('day')!, row => row.key?.slice(0, 10) ?? null)
  const byPath = groupSum(results.get('requestPath')!, row => row.key)
  return {
    totals,
    daily: period.dates.map(date => ({ date, ...(byDay.get(date) ?? zeroCount()) })),
    items: itemsOf(targets, byPath),
    referrers: breakdown(results.get('referrerHostname')!),
    countries: breakdown(results.get('country')!),
    devices: breakdown(results.get('deviceType')!),
  }
}

/** Sum of the counts of some rows. */
function sumRows(rows: AnalyticsCount[]): AnalyticsCount {
  return rows.reduce((acc, row) => ({ pageviews: acc.pageviews + row.pageviews, visitors: acc.visitors + row.visitors }), zeroCount())
}

/** Counts summed per key (rows of different path groups with the same key add up). */
function groupSum(rows: WebAnalyticsRow[], keyOf: (row: WebAnalyticsRow) => string | null): Map<string | null, AnalyticsCount> {
  // Running totals per key (null is a valid key: unknown referrer).
  const sums = new Map<string | null, AnalyticsCount>()
  for (const row of rows) {
    const key = keyOf(row)
    sums.set(key, sumRows([sums.get(key) ?? zeroCount(), row]))
  }
  return sums
}

/**
 * The items of the report: shared items (even without visits, so the
 * user sees every page they shared) and any item visited in the period.
 * Most viewed first, then by title.
 */
export function itemsOf(targets: AnalyticsTarget[], byPath: Map<string | null, AnalyticsCount>): AnalyticsItem[] {
  return targets
    .map(target => ({ ...target, ...(byPath.get(target.path) ?? zeroCount()) }))
    .filter(item => item.visibility !== 'private' || item.pageviews > 0)
    .sort((a, b) => b.pageviews - a.pageviews || a.title.localeCompare(b.title))
}

/**
 * A breakdown list: page views per value, the top BREAKDOWN_SIZE values
 * by page views, then everything else (including the API's own "Others")
 * as one final "Others" row.
 */
export function breakdown(rows: WebAnalyticsRow[]): AnalyticsBreakdownRow[] {
  const sums = groupSum(rows, row => row.key)
  // The API's "Others" is folded together with what does not make the top list.
  let others = sums.get(OTHERS)?.pageviews ?? 0
  sums.delete(OTHERS)
  // Values with views, most viewed first.
  const sorted = [...sums].map(([key, c]) => ({ key, pageviews: c.pageviews })).filter(r => r.pageviews > 0)
    .sort((a, b) => b.pageviews - a.pageviews)
  for (const row of sorted.slice(BREAKDOWN_SIZE)) others += row.pageviews
  const top = sorted.slice(0, BREAKDOWN_SIZE)
  return others > 0 ? [...top, { key: OTHERS, pageviews: others }] : top
}
