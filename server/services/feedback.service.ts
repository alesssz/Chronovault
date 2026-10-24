import type { PlayRecord, VersionVote } from '~~/shared/schemas/feedback'
import type { VersionComment, VersionFeedback, VersionVoteState } from '~~/shared/types/playlist'
import type { TrackStatus } from '~~/shared/types/track'
import type { DbClient } from '../utils/auth'
import { playlistNotFound } from '../utils/errors'
import * as feedbackRepo from '../repositories/feedback.repository'
import type { PlayRow, VoteRow, VoteStateRow } from '../repositories/feedback.repository'
import { findPlaylistRow, orderedTracks } from '../repositories/playlists.repository'

/**
 * The listeners' feedback: plays reported by the player (share pages and
 * the owner's library), and the votes on shared groups of versions.
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
 * plays per version, and the picks that came with a name or a comment.
 * 404 for a missing playlist, someone else's, or one that is not a group.
 */
export async function getVersionFeedback(db: DbClient, userId: string, playlistId: string): Promise<VersionFeedback> {
  const playlist = await findPlaylistRow(db, userId, playlistId)
  if (!playlist || playlist.purpose !== 'versions') throw playlistNotFound()
  const [plays, votes] = await Promise.all([
    feedbackRepo.listPlaylistPlayRows(db, userId, playlistId),
    feedbackRepo.listVoteRows(db, playlistId),
  ])
  return tallyFeedback(orderedTracks(playlist.playlist_tracks), plays, votes)
}

/**
 * Puts the feedback together (pure, for the tests): every version of the
 * group in the group's order, with its votes and plays. Votes and plays of
 * tracks no longer in the group are left out. Voting is open while no
 * version is final, the same rule as the SQL functions.
 */
export function tallyFeedback(
  versions: { id: string, status: TrackStatus }[],
  plays: PlayRow[],
  votes: VoteRow[],
): VersionFeedback {
  // The group's current versions: only their votes and plays count.
  const inGroup = new Set(versions.map(v => v.id))
  const counted = votes.filter(v => inGroup.has(v.track_id))
  const heard = plays.filter(p => inGroup.has(p.track_id))
  const comments: VersionComment[] = counted
    .filter(v => v.name || v.comment)
    .map(v => ({ trackId: v.track_id, name: v.name, comment: v.comment, updatedAt: v.updated_at }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return {
    open: !versions.some(v => v.status === 'final'),
    votes: counted.length,
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
