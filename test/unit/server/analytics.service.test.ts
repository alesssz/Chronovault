/**
 * Statistics service with mocked repositories and a fake Vercel client:
 * the period, the queries (only the user's paths, in groups), how the rows
 * are merged, and the demo numbers.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DbClient } from '~~/server/utils/auth'
import type { WebAnalyticsClient, WebAnalyticsQuery, WebAnalyticsRow } from '~~/server/repositories/web-analytics'
import * as tracksRepo from '~~/server/repositories/tracks.repository'
import * as playlistsRepo from '~~/server/repositories/playlists.repository'
import { BREAKDOWN_SIZE, PATHS_PER_QUERY, breakdown, getAnalyticsReport, periodOf } from '~~/server/services/analytics.service'

vi.mock('~~/server/repositories/tracks.repository', () => ({ listTrackLabels: vi.fn() }))
vi.mock('~~/server/repositories/playlists.repository', () => ({ listPlaylistLabels: vi.fn() }))

// The repositories are mocked: the client is never used.
const db = {} as DbClient
// Fixed user id (only passed through to the mocked repositories).
const USER = '11111111-1111-4111-8111-111111111111'
// "Today" for every test: periods end on this day.
const TODAY = new Date('2026-10-21T15:00:00Z')
const UPDATED_AT = '2026-10-20T10:00:00Z'

/** A track label row (unlisted with a cover unless overridden). */
function track(id: string, overrides: Partial<tracksRepo.TrackLabelRow> = {}): tracksRepo.TrackLabelRow {
  return { id, title: `Track ${id}`, visibility: 'unlisted', cover_path: `${USER}/${id}.webp`, updated_at: UPDATED_AT, ...overrides }
}

/** A fake Vercel client answering each query kind with the given rows. */
function fakeClient(rowsBy: Partial<Record<WebAnalyticsQuery['by'], WebAnalyticsRow[]>>) {
  const aggregate = vi.fn(async (q: WebAnalyticsQuery) => rowsBy[q.by] ?? [])
  return { client: { aggregate } as unknown as WebAnalyticsClient, aggregate }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(tracksRepo.listTrackLabels).mockResolvedValue([])
  vi.mocked(playlistsRepo.listPlaylistLabels).mockResolvedValue([])
})

describe('periodOf', () => {
  it('lists the days ending today (UTC), both ends included', () => {
    const period = periodOf(7, TODAY)
    expect(period.since).toBe('2026-10-15')
    expect(period.until).toBe('2026-10-21')
    expect(period.dates).toHaveLength(7)
  })

  it('crosses month boundaries', () => {
    expect(periodOf(30, TODAY).since).toBe('2026-09-22')
  })
})

describe('getAnalyticsReport', () => {
  it('returns an empty report without touching the database when not configured', async () => {
    const report = await getAnalyticsReport(db, USER, 7, { kind: 'unconfigured' }, TODAY)
    expect(report).toMatchObject({ source: 'unconfigured', totals: { pageviews: 0, visitors: 0 }, items: [] })
    expect(report.daily).toHaveLength(7)
    expect(tracksRepo.listTrackLabels).not.toHaveBeenCalled()
  })

  it('queries only the user\'s pages, in production, and merges the rows', async () => {
    vi.mocked(tracksRepo.listTrackLabels).mockResolvedValue([
      track('a'),
      track('b', { visibility: 'private' }),
      track('c', { visibility: 'private' }),
    ])
    vi.mocked(playlistsRepo.listPlaylistLabels).mockResolvedValue([
      { id: 'p', title: 'Mix', visibility: 'public', cover_path: null, updated_at: UPDATED_AT },
    ])
    const { client, aggregate } = fakeClient({
      environment: [{ key: 'production', pageviews: 10, visitors: 6 }],
      day: [{ key: '2026-10-20T00:00:00.000Z', pageviews: 10, visitors: 6 }],
      requestPath: [{ key: '/t/a', pageviews: 7, visitors: 4 }, { key: '/t/b', pageviews: 3, visitors: 2 }],
      referrerHostname: [{ key: null, pageviews: 6, visitors: 4 }, { key: 'whatsapp.com', pageviews: 4, visitors: 2 }],
    })

    const report = await getAnalyticsReport(db, USER, 7, { kind: 'vercel', client }, TODAY)

    // One group of six queries, all on the same filter.
    expect(aggregate).toHaveBeenCalledTimes(6)
    const filter = aggregate.mock.calls[0]![0].filter
    expect(filter).toBe('environment eq \'production\' and requestPath in (\'/t/a\', \'/t/b\', \'/t/c\', \'/p/p\')')
    expect(aggregate.mock.calls.every(([q]) => q.since === '2026-10-15' && q.until === '2026-10-21' && q.filter === filter)).toBe(true)

    expect(report.source).toBe('vercel')
    expect(report.totals).toEqual({ pageviews: 10, visitors: 6 })
    // Every day of the period, zero when Vercel has no row for it.
    expect(report.daily.map(d => d.pageviews)).toEqual([0, 0, 0, 0, 0, 10, 0])
    // Shared items always; private ones only with visits ("c" has none). Most viewed first.
    expect(report.items.map(i => [i.path, i.pageviews])).toEqual([['/t/a', 7], ['/t/b', 3], ['/p/p', 0]])
    expect(report.items[0]!.coverUrl).toMatch('/api/covers/tracks/a?v=')
    expect(report.items[2]!.coverUrl).toBeNull()
    expect(report.referrers).toEqual([{ key: null, pageviews: 6 }, { key: 'whatsapp.com', pageviews: 4 }])
  })

  it('splits many pages into groups that fit the filter limit, and sums them', async () => {
    const tracks = Array.from({ length: PATHS_PER_QUERY + 1 }, (_, i) => track(`00000000-0000-4000-8000-${String(i).padStart(12, '0')}`))
    vi.mocked(tracksRepo.listTrackLabels).mockResolvedValue(tracks)
    const { client, aggregate } = fakeClient({ environment: [{ key: 'production', pageviews: 5, visitors: 4 }] })

    const report = await getAnalyticsReport(db, USER, 30, { kind: 'vercel', client }, TODAY)

    expect(aggregate).toHaveBeenCalledTimes(12)
    // Every filter fits the API's 2048-character limit.
    expect(aggregate.mock.calls.every(([q]) => q.filter!.length <= 2048)).toBe(true)
    expect(report.totals).toEqual({ pageviews: 10, visitors: 8 })
  })

  it('makes no queries for a user with nothing to count', async () => {
    const { client, aggregate } = fakeClient({})
    const report = await getAnalyticsReport(db, USER, 7, { kind: 'vercel', client }, TODAY)
    expect(aggregate).not.toHaveBeenCalled()
    expect(report.totals.pageviews).toBe(0)
  })
})

describe('breakdown', () => {
  it('keeps the top values and folds the rest, with the API\'s "Others", into one row', () => {
    const rows = Array.from({ length: BREAKDOWN_SIZE + 2 }, (_, i) => ({ key: `site${i}.com`, pageviews: 100 - i, visitors: 1 }))
    const result = breakdown([...rows, { key: 'Others', pageviews: 5, visitors: 1 }])
    expect(result).toHaveLength(BREAKDOWN_SIZE + 1)
    expect(result[0]).toEqual({ key: 'site0.com', pageviews: 100 })
    // The two values beyond the top (92 + 91) plus the API's 5.
    expect(result.at(-1)).toEqual({ key: 'Others', pageviews: 188 })
  })
})

describe('demo numbers', () => {
  it('invent visits for the shared items only, consistent and the same on every call', async () => {
    vi.mocked(tracksRepo.listTrackLabels).mockResolvedValue([track('a'), track('b'), track('x', { visibility: 'private' })])

    const report = await getAnalyticsReport(db, USER, 30, { kind: 'demo' }, TODAY)
    const again = await getAnalyticsReport(db, USER, 30, { kind: 'demo' }, TODAY)

    expect(report.source).toBe('demo')
    expect(again).toEqual(report)
    expect(report.items.map(i => i.id).sort()).toEqual(['a', 'b'])
    // Total page views of a list of rows.
    const sum = (rows: { pageviews: number }[]) => rows.reduce((n, r) => n + r.pageviews, 0)
    // Every view is in exactly one day, one item, one referrer, country and device.
    expect(report.totals.pageviews).toBeGreaterThan(0)
    expect(sum(report.daily)).toBe(report.totals.pageviews)
    expect(sum(report.items)).toBe(report.totals.pageviews)
    expect(sum(report.referrers)).toBe(report.totals.pageviews)
    expect(sum(report.countries)).toBe(report.totals.pageviews)
    expect(sum(report.devices)).toBe(report.totals.pageviews)
  })

  it('use a few items when nothing is shared, so the page is not empty', async () => {
    vi.mocked(tracksRepo.listTrackLabels).mockResolvedValue([track('x', { visibility: 'private' })])
    const report = await getAnalyticsReport(db, USER, 30, { kind: 'demo' }, TODAY)
    expect(report.items.map(i => i.id)).toEqual(['x'])
  })
})
