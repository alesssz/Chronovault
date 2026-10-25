import type { AnalyticsBreakdownRow, AnalyticsCount, AnalyticsDay } from '~~/shared/types/analytics'
import { itemsOf, zeroCount, type AnalyticsNumbers, type AnalyticsPeriodDays, type AnalyticsTarget } from './analytics.service'

/**
 * Made-up statistics for environments without Vercel Web Analytics (local
 * development, Docker, e2e tests), so the Statistics page can be built and
 * tried anywhere. The report is flagged `source: 'demo'` and the page says
 * so in a banner: these numbers are never presented as real.
 *
 * The numbers are built around the user's real items (titles, covers) and
 * are deterministic: the same item and day always give the same count, so
 * a reload or a period change does not reshuffle everything.
 */

/** Items that get demo visits when nothing is shared yet (so the page is not empty). */
const FALLBACK_ITEMS = 5

/** Demo referrers and their share of page views (null = direct visit). */
const REFERRERS: [string | null, number][] = [
  [null, 0.34], ['whatsapp.com', 0.24], ['instagram.com', 0.16], ['t.co', 0.08],
  ['google.com', 0.07], ['facebook.com', 0.06], ['reddit.com', 0.05],
]
/** Demo countries (ISO codes) and their share. */
const COUNTRIES: [string, number][] = [
  ['IT', 0.58], ['US', 0.11], ['DE', 0.08], ['GB', 0.07], ['FR', 0.06], ['ES', 0.05], ['CH', 0.05],
]
/** Demo device types and their share. */
const DEVICES: [string, number][] = [['mobile', 0.64], ['desktop', 0.31], ['tablet', 0.05]]

/** Demo numbers for these targets over this period. */
export function demoNumbers(targets: AnalyticsTarget[], period: AnalyticsPeriodDays): AnalyticsNumbers {
  // Shared items get visits; with nothing shared, a few items stand in for them.
  const shared = targets.filter(t => t.visibility !== 'private')
  const visited = shared.length ? shared : targets.slice(0, FALLBACK_ITEMS)

  // Each visited item's totals, by public page path (what itemsOf expects).
  const byPath = new Map<string | null, AnalyticsCount>()
  // Every day of the period, filled item by item below.
  const daily: AnalyticsDay[] = period.dates.map(date => ({ date, ...zeroCount() }))
  for (const target of visited) {
    // Some items are much more popular than others (0.3-3.3 views a day on average).
    const popularity = 0.3 + 3 * random(target.id)
    // This item's totals over the period.
    const sum = zeroCount()
    period.dates.forEach((date, i) => {
      // Weekends get more visits.
      const weekday = new Date(`${date}T00:00:00Z`).getUTCDay()
      const weekendBoost = weekday === 0 || weekday === 6 ? 1.5 : 1
      // Rounded to nearest: even the least popular item gets a visit now and then.
      const pageviews = Math.round(random(`${target.id}:${date}`) * 2 * popularity * weekendBoost)
      // Visitors: most views come from different people, some from the same one.
      const visitors = pageviews ? Math.max(1, Math.round(pageviews * (0.6 + 0.3 * random(`${date}:${target.id}`)))) : 0
      daily[i]!.pageviews += pageviews
      daily[i]!.visitors += visitors
      sum.pageviews += pageviews
      sum.visitors += visitors
    })
    byPath.set(target.path, sum)
  }

  // Page views of the whole period, all items together.
  const pageviews = daily.reduce((n, d) => n + d.pageviews, 0)
  // Over a whole period some visitors come back on other days: fewer unique visitors than the daily sum.
  const visitors = Math.round(daily.reduce((n, d) => n + d.visitors, 0) * 0.8)
  return {
    totals: { pageviews, visitors },
    daily,
    items: itemsOf(targets, byPath),
    referrers: split(pageviews, REFERRERS),
    countries: split(pageviews, COUNTRIES),
    devices: split(pageviews, DEVICES),
  }
}

/**
 * Splits a total by shares, rounding so the parts add up exactly
 * (largest remainders get the leftover units); empty parts are dropped.
 */
function split(total: number, shares: [string | null, number][]): AnalyticsBreakdownRow[] {
  // Each key's exact (fractional) part of the total.
  const exact = shares.map(([key, share]) => ({ key, value: total * share }))
  // Rounded down: the leftover units are handed out below.
  const rows = exact.map(({ key, value }) => ({ key, pageviews: Math.floor(value) }))
  // Units lost to rounding down go to the largest fractional parts.
  let leftover = total - rows.reduce((n, r) => n + r.pageviews, 0)
  const byRemainder = exact.map((e, i) => ({ i, rest: e.value - Math.floor(e.value) })).sort((a, b) => b.rest - a.rest)
  for (const { i } of byRemainder) {
    if (leftover <= 0) break
    rows[i]!.pageviews++
    leftover--
  }
  return rows.filter(r => r.pageviews > 0).sort((a, b) => b.pageviews - a.pageviews)
}

/**
 * A deterministic pseudo-random number in [0, 1) for a text: FNV-1a hash,
 * then one step of mulberry32 to spread similar texts apart.
 */
export function random(seed: string): number {
  // FNV-1a: offset basis, then xor and multiply by the FNV prime for each character.
  let hash = 0x811C9DC5
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  // mulberry32 finalizer: mixes the bits so close seeds give unrelated numbers.
  let t = (hash + 0x6D2B79F5) >>> 0
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
