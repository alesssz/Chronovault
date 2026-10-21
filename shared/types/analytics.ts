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
