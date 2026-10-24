import type { AnalyticsPeriod, PlaysCount, PlaysItem, PlaysReport } from '~~/shared/types/analytics'
import type { DbClient } from '../utils/auth'
import { listPlayRows, type PlayRow } from '../repositories/feedback.repository'
import { listTargets, periodOf, type AnalyticsPeriodDays, type AnalyticsTarget } from './analytics.service'

/**
 * Plays of the user's tracks for the Statistics page: what visitors really
 * listened to, next to the page openings counted by Vercel
 * (analytics.service.ts). The app counts these itself (table `plays`), so
 * the numbers are real everywhere, local development included.
 *
 * Visitors' plays and the owner's own are kept apart: the owner listening
 * to their drafts must not look like interest from friends.
 */

/** The plays report for the last `days` days (`today` injectable for tests). */
export async function getPlaysReport(db: DbClient, userId: string, days: AnalyticsPeriod, today = new Date()): Promise<PlaysReport> {
  const period = periodOf(days, today)
  const [rows, targets] = await Promise.all([listPlayRows(db, userId, period.since), listTargets(db, userId)])
  return { days, since: period.since, until: period.until, ...summarizePlays(rows, targets, period) }
}

/** No plays: the starting point of every count (a new object each time). */
function zeroPlays(): PlaysCount {
  return { plays: 0, completed: 0, listeners: 0 }
}

/** Plays, completed plays and different listeners of some rows. */
export function countPlays(rows: PlayRow[]): PlaysCount {
  return {
    plays: rows.length,
    completed: rows.filter(r => r.completed).length,
    listeners: new Set(rows.map(r => r.listener_id)).size,
  }
}

/**
 * The share page a visitor's play happened on: the playlist or group it
 * was heard through (/p/<id>), or the track's own page (/t/<id>).
 */
export function pagePathOf(row: PlayRow): string {
  return row.playlist_id ? `/p/${row.playlist_id}` : `/t/${row.track_id}`
}

/**
 * The numbers of a report (pure, for the tests). Rows outside the period
 * are ignored; the owner's own plays only make `ownPlays`. Plays of a page
 * that no longer exists (a deleted playlist) still count in the totals and
 * per day, but have no row in `items`.
 */
export function summarizePlays(
  rows: PlayRow[],
  targets: AnalyticsTarget[],
  period: AnalyticsPeriodDays,
): Pick<PlaysReport, 'totals' | 'ownPlays' | 'daily' | 'items'> {
  // The rows of the period, by who listened.
  const inPeriod = rows.filter(r => r.played_on >= period.since && r.played_on <= period.until)
  const visitors = inPeriod.filter(r => r.listener === 'visitor')
  const ownPlays = inPeriod.length - visitors.length

  // Visitors' plays per day and per share page.
  const perDay = new Map<string, number>()
  const perPage = new Map<string, PlayRow[]>()
  for (const row of visitors) {
    perDay.set(row.played_on, (perDay.get(row.played_on) ?? 0) + 1)
    const path = pagePathOf(row)
    perPage.set(path, [...(perPage.get(path) ?? []), row])
  }

  const items: PlaysItem[] = targets
    .flatMap(target => (perPage.has(target.path) ? [{ ...target, ...countPlays(perPage.get(target.path)!) }] : []))
    .sort((a, b) => b.plays - a.plays || a.title.localeCompare(b.title))

  return {
    totals: visitors.length ? countPlays(visitors) : zeroPlays(),
    ownPlays,
    daily: period.dates.map(date => ({ date, plays: perDay.get(date) ?? 0 })),
    items,
  }
}
