import type { Tables } from '~~/shared/types/database.types'
import type { DbClient } from '../utils/auth'
import { toHttpError } from '../utils/errors'
import { readAllPages } from './pages'

/**
 * Access to the `genres` table: built-in genres (`user_id IS NULL`, visible
 * to everyone) and each user's custom genres (visible to their owner only,
 * enforced by RLS).
 */

export type GenreRow = Pick<Tables<'genres'>, 'id' | 'name' | 'user_id'>

/** Built-in genres + the user's custom genres, sorted by name (read in pages, like every list that grows). */
export async function listGenreRows(db: DbClient, userId: string): Promise<GenreRow[]> {
  return readAllPages((from, to) => db
    .from('genres')
    .select('id, name, user_id')
    // RLS already hides other users' genres; the filter keeps the intent explicit.
    .or(`user_id.is.null,user_id.eq.${userId}`)
    .order('name')
    // Built-in and custom genres may share a name: the id makes the pages stable.
    .order('id')
    .range(from, to), 'genres.list')
}

/** Inserts a custom genre; a duplicate name (case-insensitive) fails with 409 (unique index). */
export async function insertGenreRow(db: DbClient, userId: string, name: string): Promise<GenreRow> {
  const { data, error } = await db.from('genres').insert({ user_id: userId, name }).select('id, name, user_id').single()
  if (error) throw toHttpError(error, 'genres.insert')
  return data
}
