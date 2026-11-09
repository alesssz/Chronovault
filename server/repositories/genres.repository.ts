import type { Tables } from '~~/shared/types/database.types'
import type { DbClient } from '../utils/auth'
import { toHttpError } from '../utils/errors'
import { readAllPages } from './pages'

/**
 * Access to the `genres` table (a fixed list, readable by everyone, written by
 * migrations only) and the `subgenres` table: built-in subgenres
 * (`user_id IS NULL`, visible to everyone) and each user's custom ones
 * (visible to their owner only, enforced by RLS).
 */

/** A genre row as the API needs it. */
export type GenreRow = Pick<Tables<'genres'>, 'id' | 'name'>

/** A subgenre row as the API needs it (`user_id` null: built-in). */
export type SubgenreRow = Pick<Tables<'subgenres'>, 'id' | 'genre_id' | 'name' | 'user_id'>

/** Every genre, sorted by name (19 rows: one request). */
export async function listGenreRows(db: DbClient): Promise<GenreRow[]> {
  // The whole list: readable by everyone, never more than one page.
  const { data, error } = await db.from('genres').select('id, name').order('name')
  if (error) throw toHttpError(error, 'genres.list')
  return data
}

/** Built-in subgenres + the user's own, sorted by name (read in pages: over 400 built-in, and the user's grow). */
export async function listSubgenreRows(db: DbClient, userId: string): Promise<SubgenreRow[]> {
  return readAllPages((from, to) => db
    .from('subgenres')
    .select('id, genre_id, name, user_id')
    // RLS already hides other users' subgenres; the filter keeps the intent explicit.
    .or(`user_id.is.null,user_id.eq.${userId}`)
    .order('name')
    // Built-in and custom subgenres of different genres may share a name: the id makes the pages stable.
    .order('id')
    .range(from, to), 'subgenres.list')
}

/**
 * Inserts a custom subgenre. A duplicate name in that genre fails with 409
 * (unique index); a name incoherent with the genre (the trigger) with 400:
 * the service checks both first, with a friendlier answer.
 */
export async function insertSubgenreRow(db: DbClient, userId: string, genreId: string, name: string): Promise<SubgenreRow> {
  // The new row, read back in the same request.
  const { data, error } = await db
    .from('subgenres')
    .insert({ user_id: userId, genre_id: genreId, name })
    .select('id, genre_id, name, user_id')
    .single()
  if (error) throw toHttpError(error, 'subgenres.insert')
  return data
}
