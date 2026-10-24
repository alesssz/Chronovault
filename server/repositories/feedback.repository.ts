import type { PostgrestError } from '@supabase/supabase-js'
import type { Tables } from '~~/shared/types/database.types'
import type { PlayRecord, VersionVote } from '~~/shared/schemas/feedback'
import type { DbClient } from '../utils/auth'
import { toHttpError } from '../utils/errors'

/**
 * Access to the listeners' feedback: the `plays` and `version_votes` tables.
 *
 * Writes go through the record_play and *_version_vote database functions
 * (`security definer`): they check that the track or group is really shared
 * (or the caller's own), recognise the owner by the session, and close the
 * vote once a version is final. That logic lives in SQL
 * (supabase/migrations/…_plays_and_votes.sql) and is covered by the pgTAP
 * tests, not in this file. Reads are the owner's, through RLS.
 */

/** A play as the Statistics and Versions pages need it. */
export type PlayRow = Pick<Tables<'plays'>, 'track_id' | 'playlist_id' | 'listener' | 'listener_id' | 'completed' | 'played_on'>
/** A vote as the Versions page needs it. */
export type VoteRow = Pick<Tables<'version_votes'>, 'track_id' | 'name' | 'comment' | 'updated_at'>
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

/**
 * Most rows PostgREST returns per request (`max_rows` in supabase/config.toml,
 * the same default on Supabase Cloud). Longer results are cut silently, so the
 * reads below fetch page after page.
 */
export const PAGE_SIZE = 1000

/**
 * Every row of a query, read PAGE_SIZE at a time. `page` runs the query for
 * one range of rows; it must order them by a unique key, or pages could
 * overlap or skip rows.
 */
async function readAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null, error: PostgrestError | null }>,
  context: string,
): Promise<T[]> {
  // Rows of the pages read so far.
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1)
    if (error) throw toHttpError(error, context)
    rows.push(...(data ?? []))
    // A short page is the last one.
    if (!data || data.length < PAGE_SIZE) return rows
  }
}

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
