/**
 * Plays report (Statistics page): visitors' plays in total, per day and per share page (a
 * track's own page or the playlist it was heard through), the owner's own plays apart, rows
 * outside the period ignored, and plays of a deleted playlist counted in the totals only.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DbClient } from '~~/server/utils/auth'
import type { PlayRow } from '~~/server/repositories/feedback.repository'
import { listPlayRows } from '~~/server/repositories/feedback.repository'
import { listPlaylistLabels } from '~~/server/repositories/playlists.repository'
import { listTrackLabels } from '~~/server/repositories/tracks.repository'
import { periodOf, type AnalyticsTarget } from '~~/server/services/analytics.service'
import { countPlays, getPlaysReport, pagePathOf, summarizePlays } from '~~/server/services/plays.service'

vi.mock('~~/server/repositories/feedback.repository')
vi.mock('~~/server/repositories/tracks.repository')
vi.mock('~~/server/repositories/playlists.repository')

// The repositories are mocked: the client is never used, any object will do.
const db = {} as DbClient
const USER = '11111111-1111-4111-8111-111111111111'
// A track with its own page, and a playlist.
const TRACK = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const LIST = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const GONE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

/** The 7 days ending on 2026-10-24. */
const period = periodOf(7, new Date('2026-10-24T12:00:00Z'))

/** The share pages of the user (what listTargets returns). */
const targets: AnalyticsTarget[] = [
  { kind: 'track', id: TRACK, title: 'Song', visibility: 'unlisted', coverUrl: null, path: `/t/${TRACK}` },
  { kind: 'playlist', id: LIST, title: 'List', visibility: 'unlisted', coverUrl: null, path: `/p/${LIST}` },
]

/** A play on a day, by a listener; `playlist` null for the track's own page. */
function row(day: string, listener: string, playlist: string | null = null, extra: Partial<PlayRow> = {}): PlayRow {
  return {
    track_id: TRACK, playlist_id: playlist, listener: 'visitor', listener_id: listener,
    completed: false, played_on: day, ...extra,
  }
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('pagePathOf and countPlays', () => {
  it('puts a play on the playlist it was heard through, or on the track\'s page', () => {
    expect(pagePathOf(row('2026-10-24', 'l1', LIST))).toBe(`/p/${LIST}`)
    expect(pagePathOf(row('2026-10-24', 'l1'))).toBe(`/t/${TRACK}`)
  })

  it('counts plays, completed plays and different listeners', () => {
    expect(countPlays([row('2026-10-23', 'l1', null, { completed: true }), row('2026-10-24', 'l1'), row('2026-10-24', 'l2')]))
      .toEqual({ plays: 3, completed: 1, listeners: 2 })
  })
})

describe('summarizePlays', () => {
  it('sums visitors\' plays per day and per page, own plays apart', () => {
    const summary = summarizePlays([
      row('2026-10-24', 'l1', LIST, { completed: true }),
      row('2026-10-24', 'l2', LIST),
      row('2026-10-22', 'l1'),
      row('2026-10-24', USER, null, { listener: 'owner' }),
    ], targets, period)
    expect(summary.totals).toEqual({ plays: 3, completed: 1, listeners: 2 })
    expect(summary.ownPlays).toBe(1)
    expect(summary.daily).toHaveLength(7)
    expect(summary.daily.at(-1)).toEqual({ date: '2026-10-24', plays: 2 })
    expect(summary.daily.find(d => d.date === '2026-10-22')?.plays).toBe(1)
    // Most played first.
    expect(summary.items.map(i => [i.path, i.plays, i.completed])).toEqual([
      [`/p/${LIST}`, 2, 1],
      [`/t/${TRACK}`, 1, 0],
    ])
  })

  it('ignores rows outside the period', () => {
    expect(summarizePlays([row('2026-10-01', 'l1')], targets, period).totals.plays).toBe(0)
  })

  it('counts plays of a deleted playlist in the totals, without an item', () => {
    const summary = summarizePlays([row('2026-10-24', 'l1', GONE)], targets, period)
    expect(summary.totals.plays).toBe(1)
    expect(summary.items).toEqual([])
  })

  it('has zero totals and every day at zero without plays', () => {
    const summary = summarizePlays([], targets, period)
    expect(summary.totals).toEqual({ plays: 0, completed: 0, listeners: 0 })
    expect(summary.daily.every(d => d.plays === 0)).toBe(true)
  })
})

describe('getPlaysReport', () => {
  it('reads the period\'s plays and the user\'s pages', async () => {
    vi.mocked(listPlayRows).mockResolvedValue([row('2026-10-24', 'l1')])
    vi.mocked(listTrackLabels).mockResolvedValue([{ id: TRACK, title: 'Song', visibility: 'unlisted', cover_path: null, updated_at: '' }])
    vi.mocked(listPlaylistLabels).mockResolvedValue([])
    const report = await getPlaysReport(db, USER, 7, new Date('2026-10-24T12:00:00Z'))
    expect(listPlayRows).toHaveBeenCalledWith(db, USER, '2026-10-18')
    expect(report).toMatchObject({ days: 7, since: '2026-10-18', until: '2026-10-24', ownPlays: 0 })
    expect(report.items).toEqual([expect.objectContaining({ path: `/t/${TRACK}`, title: 'Song', plays: 1 })])
  })
})
