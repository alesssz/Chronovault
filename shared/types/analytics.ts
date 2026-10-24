import type { TrackVisibility } from './track'

/**
 * Visit statistics of the user's share pages (the Statistics page,
 * GET /api/analytics).
 *
 * The numbers come from Vercel Web Analytics, which counts page views of
 * the public pages /t/<track id> and /p/<playlist id>. Outside Vercel
 * (local development, Docker, e2e tests) there is no such data: the server
 * then generates clearly flagged demo numbers instead (`source: 'demo'`).
 */

/** Selectable periods, in days. Vercel's Hobby plan keeps one month of data. */
export const ANALYTICS_PERIODS = [7, 30] as const
/** One of the selectable periods (7 or 30 days). */
export type AnalyticsPeriod = (typeof ANALYTICS_PERIODS)[number]

/**
 * Where the numbers come from:
 * - `vercel`: real data, read from the Vercel Web Analytics API;
 * - `demo`: made-up numbers, because the app is not running on Vercel;
 * - `unconfigured`: running on Vercel, but the API token or project id is
 *   missing (the page explains how to set them).
 */
export type AnalyticsSource = 'vercel' | 'demo' | 'unconfigured'

/** Page views and unique visitors. */
export interface AnalyticsCount {
  pageviews: number
  visitors: number
}

/** One day of the period (UTC). */
export interface AnalyticsDay extends AnalyticsCount {
  /** `YYYY-MM-DD`. */
  date: string
}

/** A shared track or playlist and the visits to its public page. */
export interface AnalyticsItem extends AnalyticsCount {
  kind: 'track' | 'playlist'
  id: string
  title: string
  /** Current visibility: a page made private again keeps its past visits. */
  visibility: TrackVisibility
  /** Cover address, or null (no cover; playlists without a custom one). */
  coverUrl: string | null
  /** The public page: `/t/<id>` or `/p/<id>`. */
  path: string
}

/** One value of a breakdown (referrer, country, device) and its page views. */
export interface AnalyticsBreakdownRow {
  /**
   * Referrer hostname, ISO country code or device type; null when unknown
   * (for referrers: a direct visit, e.g. a link opened from a chat app that
   * sends no referrer). `Others` groups the values beyond the top ones.
   */
  key: string | null
  pageviews: number
}

// --- Plays ---------------------------------------------------------------------------
// Counted by the app itself (table `plays`), not by Vercel: real numbers
// everywhere, local development included. A play is a real listen (30 s,
// or half of a shorter track), counted once per listener, track, context and
// day; "completed" means listened to 90%.

/** Visitors' plays: how many, how many to the end, and by how many different listeners. */
export interface PlaysCount {
  plays: number
  completed: number
  /** Different visitors' browsers (one person on two devices counts twice). */
  listeners: number
}

/** Visitors' plays of one day of the period (UTC). */
export interface PlaysDay {
  /** `YYYY-MM-DD`. */
  date: string
  plays: number
}

/**
 * The visitors' plays of a share page: on a track's own page (/t/<id>), or
 * through a shared playlist or group (/p/<id>, its tracks together). Same
 * identity fields as AnalyticsItem (`path` is the key the Statistics page
 * joins them on), so the list works even without Vercel's numbers.
 */
export interface PlaysItem extends Omit<AnalyticsItem, keyof AnalyticsCount>, PlaysCount {}

/** Response of GET /api/analytics/plays. */
export interface PlaysReport {
  days: AnalyticsPeriod
  /** First and last day of the period, `YYYY-MM-DD` (UTC, both included). */
  since: string
  until: string
  /** Visitors only: the owner's own plays never count here. */
  totals: PlaysCount
  /** The owner's own plays (library, own share pages), shown apart. */
  ownPlays: number
  /** Every day of the period, oldest first (days without plays included, as zero). */
  daily: PlaysDay[]
  /** Share pages with visitors' plays in the period, most played first. */
  items: PlaysItem[]
}

/** Response of GET /api/analytics. */
export interface AnalyticsReport {
  source: AnalyticsSource
  days: AnalyticsPeriod
  /** First and last day of the period, `YYYY-MM-DD` (UTC, both included). */
  since: string
  until: string
  /** The whole period, all share pages together. */
  totals: AnalyticsCount
  /** Every day of the period, oldest first (days without visits included, as zero). */
  daily: AnalyticsDay[]
  /** Shared items and items visited in the period, most viewed first. */
  items: AnalyticsItem[]
  /** Most frequent first (top values only). */
  referrers: AnalyticsBreakdownRow[]
  countries: AnalyticsBreakdownRow[]
  devices: AnalyticsBreakdownRow[]
}
