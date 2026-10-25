import type { PlayRecord, VersionVote } from '~~/shared/schemas/feedback'
import type { UnseenFeedback, VersionComment, VersionFeedback, VersionVoteState } from '~~/shared/types/playlist'
import type { TrackStatus } from '~~/shared/types/track'
import type { DbClient } from '../utils/auth'
import { playlistNotFound } from '../utils/errors'
import * as feedbackRepo from '../repositories/feedback.repository'
import type { PlayRow, SeenRow, VoteRow, VoteStateRow, VoteTimeRow } from '../repositories/feedback.repository'
import { findPlaylistRow, findPlaylistTrackIds, listPlaylistRows, orderedTracks } from '../repositories/playlists.repository'

/**
 * The listeners' feedback: plays reported by the player (share pages and
 * the owner's library), the votes on shared groups of versions, and which
 * of those votes the owner has not seen yet (cast or changed after their
 * last visit to the group: the dot on "Versions", the "new" badges).
 *
 * Who may do what is decided in SQL (see feedback.repository.ts): a play or
 * a vote the caller is not entitled to answers 404 like a missing item, the
 * owner cannot vote (403), and nobody can once a version is final (409).
 * This service shapes the results for the pages.
 */

// --- Plays ----------------------------------------------------------------------------

/** Counts a play reported by the player (or marks today's completed). */
export async function recordPlay(db: DbClient, play: PlayRecord): Promise<void> {
  await feedbackRepo.recordPlay(db, play)
}

// --- Votes (public page of a group) -------------------------------------------------

/** What the group's public page shows for this visitor: voting open, owner or not, their pick. */
export async function getVoteState(db: DbClient, playlistId: string, voterId: string): Promise<VersionVoteState> {
  // This visitor's state in the group, or none when the playlist is not a shared group.
  const row = await feedbackRepo.findVoteState(db, playlistId, voterId)
  // Private, missing, or a playlist that is not a group: like any unavailable share.
  if (!row) throw playlistNotFound()
  return toVoteState(row)
}

/** Casts or changes the visitor's pick, and returns the new state. */
export async function castVote(db: DbClient, playlistId: string, vote: VersionVote): Promise<VersionVoteState> {
  await feedbackRepo.castVote(db, playlistId, vote)
  return getVoteState(db, playlistId, vote.voterId)
}

/** Takes the visitor's pick back, and returns the new state. */
export async function withdrawVote(db: DbClient, playlistId: string, voterId: string): Promise<VersionVoteState> {
  await feedbackRepo.withdrawVote(db, playlistId, voterId)
  return getVoteState(db, playlistId, voterId)
}

/** get_version_vote() row → VersionVoteState (a row without a track id has no pick). */
export function toVoteState(row: VoteStateRow): VersionVoteState {
  return {
    open: row.open,
    isOwner: row.is_owner,
    pick: row.track_id ? { trackId: row.track_id, name: row.name, comment: row.comment } : null,
  }
}

// --- Feedback (owner's Versions page) -------------------------------------------------

/**
 * The feedback on one of the user's groups of versions: votes and visitors'
 * plays per version, and the picks that came with a name or a comment, those
 * made since the owner's last visit marked new. 404 for a missing playlist,
 * someone else's, or one that is not a group.
 */
export async function getVersionFeedback(db: DbClient, userId: string, playlistId: string): Promise<VersionFeedback> {
  // Taken before reading: everything up to this instant is in what the owner will see.
  const asOf = new Date().toISOString()
  // The group with its versions (none when missing or someone else's).
  const playlist = await findPlaylistRow(db, userId, playlistId)
  if (!playlist || playlist.purpose !== 'versions') throw playlistNotFound()
  // The group's plays, its votes and the owner's last visit, read together.
  const [plays, votes, seenAt] = await Promise.all([
    feedbackRepo.listPlaylistPlayRows(db, userId, playlistId),
    feedbackRepo.listVoteRows(db, playlistId),
    feedbackRepo.findSeenAt(db, playlistId),
  ])
  // Never visited since the feature: everything since the group was made is new.
  const feedback = tallyFeedback(orderedTracks(playlist.playlist_tracks), plays, votes, seenAt ?? playlist.created_at)
  return { ...feedback, asOf }
}

/**
 * Puts the feedback together (pure, for the tests): every version of the
 * group in the group's order, with its votes and plays. Votes and plays of
 * tracks no longer in the group are left out. Voting is open while no
 * version is final, the same rule as the SQL functions. Votes cast or
 * changed after `since` (the owner's last visit) are new.
 */
export function tallyFeedback(
  versions: { id: string, status: TrackStatus }[],
  plays: PlayRow[],
  votes: VoteRow[],
  since: string,
): Omit<VersionFeedback, 'asOf'> {
  // The group's current versions: only their votes and plays count.
  const inGroup = new Set(versions.map(v => v.id))
  // Votes for versions still in the group.
  const counted = votes.filter(v => inGroup.has(v.track_id))
  // Plays of versions still in the group.
  const heard = plays.filter(p => inGroup.has(p.track_id))
  // Postgres and JavaScript write timestamps differently: compare them as instants.
  const sinceMs = Date.parse(since)
  /** The vote was cast or changed after the owner's last visit. */
  const isNew = (vote: VoteRow) => Date.parse(vote.updated_at) > sinceMs
  // The picks that came with words, most recent first.
  const comments: VersionComment[] = counted
    .filter(v => v.name || v.comment)
    .map(v => ({ trackId: v.track_id, name: v.name, comment: v.comment, updatedAt: v.updated_at, isNew: isNew(v) }))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
  return {
    open: !versions.some(v => v.status === 'final'),
    votes: counted.length,
    unseen: counted.filter(isNew).length,
    listeners: new Set(heard.map(p => p.listener_id)).size,
    versions: versions.map(v => ({
      trackId: v.id,
      votes: counted.filter(vote => vote.track_id === v.id).length,
      plays: heard.filter(p => p.track_id === v.id).length,
      completed: heard.filter(p => p.track_id === v.id && p.completed).length,
    })),
    comments,
  }
}

// --- Unseen feedback (the dot on "Versions") -------------------------------------------

/**
 * Feedback the owner has not seen yet, over all their groups: votes cast or
 * changed after their last visit to each group (the group's creation when
 * never visited). Votes for versions no longer in a group do not count.
 */
export async function getUnseenFeedback(db: DbClient, userId: string): Promise<UnseenFeedback> {
  // The user's groups, every vote time and every last visit, read together.
  const [groups, votes, seen] = await Promise.all([
    listPlaylistRows(db, userId, 'versions'),
    feedbackRepo.listVoteTimes(db),
    feedbackRepo.listSeenRows(db),
  ])
  return countUnseen(
    groups.map(g => ({ id: g.id, createdAt: g.created_at, trackIds: orderedTracks(g.playlist_tracks).map(t => t.id) })),
    votes,
    seen,
  )
}

/**
 * Counts the unseen votes per group (pure, for the tests). A vote counts
 * when its group is one of `groups`, its version is still in the group, and
 * it was cast or changed after the group's last visit.
 */
export function countUnseen(
  groups: { id: string, createdAt: string, trackIds: string[] }[],
  votes: VoteTimeRow[],
  seen: SeenRow[],
): UnseenFeedback {
  // Last visit per group, as instants.
  const seenAt = new Map(seen.map(s => [s.playlist_id, Date.parse(s.seen_at)]))
  // Unseen votes per group, filled below; groups without any stay out.
  const unseen: Record<string, number> = {}
  for (const group of groups) {
    // Votes after this instant are unseen: the last visit, or the group's creation.
    const since = seenAt.get(group.id) ?? Date.parse(group.createdAt)
    // The versions now in the group (votes for removed ones do not count).
    const versions = new Set(group.trackIds)
    // This group's unseen votes.
    const count = votes.filter(v => v.playlist_id === group.id && versions.has(v.track_id) && Date.parse(v.updated_at) > since).length
    if (count) unseen[group.id] = count
  }
  return { total: Object.values(unseen).reduce((sum, n) => sum + n, 0), groups: unseen }
}

/**
 * Records the owner's visit to one of their groups (when they leave its
 * page): its feedback up to `at` (the copy they saw; now when left out) is
 * no longer new. `at` is never taken beyond now, and a later visit already
 * recorded (another device) is kept. 404 for a missing playlist or someone
 * else's.
 * @param now injectable for tests
 */
export async function markFeedbackSeen(
  db: DbClient,
  userId: string,
  playlistId: string,
  at?: string,
  now = Date.now(),
): Promise<void> {
  if (!(await findPlaylistTrackIds(db, userId, playlistId))) throw playlistNotFound()
  // Up to the copy the owner saw, but never in the future (a wrong clock must not hide votes to come).
  const seenUntil = at ? Math.min(Date.parse(at), now) : now
  // The visit already recorded for this group, if any.
  const recorded = await feedbackRepo.findSeenAt(db, playlistId)
  // Another device already recorded a later visit: keep it (going back would make old votes new again).
  if (recorded && Date.parse(recorded) >= seenUntil) return
  await feedbackRepo.markSeen(db, playlistId, new Date(seenUntil).toISOString())
}
