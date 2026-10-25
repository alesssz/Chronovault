import type { Tables } from '~~/shared/types/database.types'
import type { PlayRecord, VersionVote } from '~~/shared/schemas/feedback'
import type { DbClient } from '../utils/auth'
import { toHttpError } from '../utils/errors'
import { readAllPages } from './pages'

/**
 * Access to the listeners' feedback: the `plays` and `version_votes`
 * tables, and `feedback_seen`, the owner's last visit to each group (what
 * makes feedback "new").
 *
 * Writes to plays and votes go through the record_play and *_version_vote
 * database functions (`security definer`): they check that the track or
 * group is really shared (or the caller's own), recognise the owner by the
 * session, and close the vote once a version is final. That logic lives in
 * SQL (supabase/migrations/…_plays_and_votes.sql) and is covered by the
 * pgTAP tests, not in this file. Reads, and the owner's visits, go straight
 * to the tables under RLS (owner only).
 */

/** A play as the Statistics and Versions pages need it. */
export type PlayRow = Pick<Tables<'plays'>, 'track_id' | 'playlist_id' | 'listener' | 'listener_id' | 'completed' | 'played_on'>
/** A vote as the Versions page needs it. */
export type VoteRow = Pick<Tables<'version_votes'>, 'track_id' | 'name' | 'comment' | 'updated_at'>
/** When a vote was cast or changed, and where: enough to count unseen feedback. */
export type VoteTimeRow = Pick<Tables<'version_votes'>, 'playlist_id' | 'track_id' | 'updated_at'>
/** The owner's last visit to a group (table `feedback_seen`). */
export type SeenRow = Pick<Tables<'feedback_seen'>, 'playlist_id' | 'seen_at'>
/** What get_version_vote() returns: the vote state of one visitor (the pick fields are null without a pick). */
export interface VoteStateRow {
  open: boolean
  is_owner: boolean
  track_id: string | null
  name: string | null
  comment: string | null
}

/** Columns read from `plays`. */
const PLAY_COLUMNS = 'track_id, playlist_id, listener, listener_id, completed, played_on'

// --- Writes (anyone, checked in SQL) -------------------------------------------------

/** Counts a play, or marks today's play completed (404 when the caller cannot listen to that track there). */
export async function recordPlay(db: DbClient, play: PlayRecord): Promise<void> {
  const { error } = await db.rpc('record_play', {
    p_track_id: play.trackId,
    // The generated types know no nullable arguments; SQL takes null as "no playlist".
    p_playlist_id: play.playlistId as string,
    p_listener_id: play.listenerId,
    p_completed: play.completed,
  })
  if (error) throw toHttpError(error, 'plays.record')
}

/** A visitor's vote state in a shared group; null when the playlist is not a shared group. */
export async function findVoteState(db: DbClient, playlistId: string, voterId: string): Promise<VoteStateRow | null> {
  const { data, error } = await db.rpc('get_version_vote', { p_playlist_id: playlistId, p_voter_id: voterId }).maybeSingle()
  if (error) throw toHttpError(error, 'votes.find')
  return data
}

/** Casts or changes a visitor's pick (404 not a shared group or version, 403 the owner, 409 voting closed). */
export async function castVote(db: DbClient, playlistId: string, vote: VersionVote): Promise<void> {
  const { error } = await db.rpc('cast_version_vote', {
    p_playlist_id: playlistId,
    p_track_id: vote.trackId,
    p_voter_id: vote.voterId,
    // Nullable in SQL (no name, no comment), like p_playlist_id above.
    p_name: vote.name as string,
    p_comment: vote.comment as string,
  })
  if (error) throw toHttpError(error, 'votes.cast')
}

/** Takes a visitor's pick back (same errors as castVote). */
export async function withdrawVote(db: DbClient, playlistId: string, voterId: string): Promise<void> {
  const { error } = await db.rpc('withdraw_version_vote', { p_playlist_id: playlistId, p_voter_id: voterId })
  if (error) throw toHttpError(error, 'votes.withdraw')
}

// --- Reads (the owner, through RLS) --------------------------------------------------

/** The plays of the user's tracks from `since` (`YYYY-MM-DD`, UTC) on, own plays included. */
export async function listPlayRows(db: DbClient, userId: string, since: string): Promise<PlayRow[]> {
  return readAllPages((from, to) => db
    .from('plays')
    .select(PLAY_COLUMNS)
    // RLS already limits the rows to the user's tracks; the filter keeps the intent explicit.
    .eq('owner_id', userId)
    .gte('played_on', since)
    .order('id')
    .range(from, to), 'plays.list')
}

/** Every visitors' play heard through one of the user's playlists (any date: a group's whole story). */
export async function listPlaylistPlayRows(db: DbClient, userId: string, playlistId: string): Promise<PlayRow[]> {
  return readAllPages((from, to) => db
    .from('plays')
    .select(PLAY_COLUMNS)
    .eq('owner_id', userId)
    .eq('playlist_id', playlistId)
    .eq('listener', 'visitor')
    .order('id')
    .range(from, to), 'plays.listPlaylist')
}

/** Every vote cast in one of the user's groups (RLS: the owner's groups only). */
export async function listVoteRows(db: DbClient, playlistId: string): Promise<VoteRow[]> {
  return readAllPages((from, to) => db
    .from('version_votes')
    .select('track_id, name, comment, updated_at')
    .eq('playlist_id', playlistId)
    // (playlist_id, voter_id) is the key: within one group, voter_id is unique.
    .order('voter_id')
    .range(from, to), 'votes.list')
}

/** When and where every vote in the user's groups was cast or last changed (RLS: the owner's groups only). */
export async function listVoteTimes(db: DbClient): Promise<VoteTimeRow[]> {
  return readAllPages((from, to) => db
    .from('version_votes')
    .select('playlist_id, track_id, updated_at')
    // (playlist_id, voter_id) is the key: a stable order for the pages.
    .order('playlist_id')
    .order('voter_id')
    .range(from, to), 'votes.listTimes')
}

// --- The owner's visits (table feedback_seen) ----------------------------------------

/** The owner's last visit to each of their groups that has one (RLS: own groups only). */
export async function listSeenRows(db: DbClient): Promise<SeenRow[]> {
  return readAllPages((from, to) => db
    .from('feedback_seen')
    .select('playlist_id, seen_at')
    .order('playlist_id')
    .range(from, to), 'feedbackSeen.list')
}

/** The owner's last visit to one group, or null when never recorded. */
export async function findSeenAt(db: DbClient, playlistId: string): Promise<string | null> {
  const { data, error } = await db.from('feedback_seen').select('seen_at').eq('playlist_id', playlistId).maybeSingle()
  if (error) throw toHttpError(error, 'feedbackSeen.find')
  return data?.seen_at ?? null
}

/** Records a visit to a group, seen up to `seenAt` (insert or move; RLS refuses someone else's group). */
export async function markSeen(db: DbClient, playlistId: string, seenAt: string): Promise<void> {
  const { error } = await db.from('feedback_seen').upsert({ playlist_id: playlistId, seen_at: seenAt })
  if (error) throw toHttpError(error, 'feedbackSeen.mark')
}
