/**
 * Listeners' feedback service with mocked repositories: the vote state of a visitor (404 for
 * anything but a shared group), votes and plays tallied per version (only versions still in the
 * group, own plays excluded by the query, voting open until a version is final), notes newest
 * first, and the owner's feedback refused for plain playlists.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DbClient } from '~~/server/utils/auth'
import type { PlayRow, VoteRow } from '~~/server/repositories/feedback.repository'
import * as feedbackRepo from '~~/server/repositories/feedback.repository'
import { findPlaylistRow } from '~~/server/repositories/playlists.repository'
import { castVote, getVersionFeedback, getVoteState, tallyFeedback, toVoteState } from '~~/server/services/feedback.service'

vi.mock('~~/server/repositories/feedback.repository')
vi.mock('~~/server/repositories/playlists.repository', async (importOriginal) => {
  // orderedTracks is pure: keep it; only the query is mocked.
  const original = await importOriginal<typeof import('~~/server/repositories/playlists.repository')>()
  return { ...original, findPlaylistRow: vi.fn() }
})

// The repositories are mocked: the client is never used, any object will do.
const db = {} as DbClient
// Fixed ids: the user, a group, its two versions, and one track outside it.
const USER = '11111111-1111-4111-8111-111111111111'
const GROUP = '22222222-2222-4222-8222-222222222222'
const V1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const V2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const OTHER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const VOTER = '33333333-3333-4333-8333-333333333333'

/** A visitor's play heard through the group. */
function play(trackId: string, listenerId: string, completed = false): PlayRow {
  return { track_id: trackId, playlist_id: GROUP, listener: 'visitor', listener_id: listenerId, completed, played_on: '2026-10-24' }
}

/** A vote, with an optional note. */
function vote(trackId: string, note: Partial<Pick<VoteRow, 'name' | 'comment' | 'updated_at'>> = {}): VoteRow {
  return { track_id: trackId, name: null, comment: null, updated_at: '2026-10-24T10:00:00Z', ...note }
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('tallyFeedback', () => {
  const drafts = [{ id: V1, status: 'draft' as const }, { id: V2, status: 'draft' as const }]

  it('counts votes and plays per version, in the group\'s order', () => {
    const feedback = tallyFeedback(
      drafts,
      [play(V1, 'l1', true), play(V1, 'l2'), play(V2, 'l1')],
      [vote(V2), vote(V2), vote(V1)],
    )
    expect(feedback.versions).toEqual([
      { trackId: V1, votes: 1, plays: 2, completed: 1 },
      { trackId: V2, votes: 2, plays: 1, completed: 0 },
    ])
    expect(feedback.votes).toBe(3)
    expect(feedback.listeners).toBe(2)
    expect(feedback.open).toBe(true)
  })

  it('leaves out votes and plays of versions no longer in the group', () => {
    const feedback = tallyFeedback(drafts, [play(OTHER, 'l9')], [vote(OTHER)])
    expect(feedback.votes).toBe(0)
    expect(feedback.listeners).toBe(0)
    expect(feedback.versions.every(v => v.votes === 0 && v.plays === 0)).toBe(true)
  })

  it('closes voting once a version is final', () => {
    expect(tallyFeedback([{ id: V1, status: 'final' }, { id: V2, status: 'draft' }], [], []).open).toBe(false)
  })

  it('lists the picks that came with a name or a comment, newest first', () => {
    const feedback = tallyFeedback(drafts, [], [
      vote(V1, { name: 'Ada', updated_at: '2026-10-20T10:00:00Z' }),
      vote(V2),
      vote(V2, { comment: 'Better drums', updated_at: '2026-10-22T10:00:00Z' }),
    ])
    expect(feedback.comments).toEqual([
      { trackId: V2, name: null, comment: 'Better drums', updatedAt: '2026-10-22T10:00:00Z' },
      { trackId: V1, name: 'Ada', comment: null, updatedAt: '2026-10-20T10:00:00Z' },
    ])
  })
})

describe('vote state', () => {
  it('turns the database row into the page\'s state', () => {
    expect(toVoteState({ open: true, is_owner: false, track_id: V1, name: 'Ada', comment: null }))
      .toEqual({ open: true, isOwner: false, pick: { trackId: V1, name: 'Ada', comment: null } })
    expect(toVoteState({ open: false, is_owner: true, track_id: null, name: null, comment: null }))
      .toEqual({ open: false, isOwner: true, pick: null })
  })

  it('answers 404 for a playlist that is not a shared group', async () => {
    vi.mocked(feedbackRepo.findVoteState).mockResolvedValue(null)
    await expect(getVoteState(db, GROUP, VOTER)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('returns the new state after a vote', async () => {
    vi.mocked(feedbackRepo.findVoteState).mockResolvedValue({ open: true, is_owner: false, track_id: V2, name: null, comment: null })
    const state = await castVote(db, GROUP, { voterId: VOTER, trackId: V2, name: null, comment: null })
    expect(feedbackRepo.castVote).toHaveBeenCalledWith(db, GROUP, { voterId: VOTER, trackId: V2, name: null, comment: null })
    expect(state.pick?.trackId).toBe(V2)
  })
})

describe('getVersionFeedback', () => {
  it('answers 404 for a missing playlist or a plain playlist', async () => {
    vi.mocked(findPlaylistRow).mockResolvedValue(null)
    await expect(getVersionFeedback(db, USER, GROUP)).rejects.toMatchObject({ statusCode: 404 })
    vi.mocked(findPlaylistRow).mockResolvedValue({ purpose: 'playlist', playlist_tracks: [] } as never)
    await expect(getVersionFeedback(db, USER, GROUP)).rejects.toMatchObject({ statusCode: 404 })
    expect(feedbackRepo.listVoteRows).not.toHaveBeenCalled()
  })

  it('tallies a group from its tracks, plays and votes', async () => {
    vi.mocked(findPlaylistRow).mockResolvedValue({
      purpose: 'versions',
      playlist_tracks: [
        { position: 1, tracks: { id: V2, status: 'draft' } },
        { position: 0, tracks: { id: V1, status: 'final' } },
      ],
    } as never)
    vi.mocked(feedbackRepo.listPlaylistPlayRows).mockResolvedValue([play(V1, 'l1')])
    vi.mocked(feedbackRepo.listVoteRows).mockResolvedValue([vote(V1)])
    const feedback = await getVersionFeedback(db, USER, GROUP)
    expect(feedbackRepo.listPlaylistPlayRows).toHaveBeenCalledWith(db, USER, GROUP)
    expect(feedback.versions.map(v => v.trackId)).toEqual([V1, V2])
    expect(feedback.open).toBe(false)
    expect(feedback.versions[0]).toEqual({ trackId: V1, votes: 1, plays: 1, completed: 0 })
  })
})
