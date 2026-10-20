import type { Tables } from '~~/shared/types/database.types'
import type { DbClient } from '../utils/auth'
import { toHttpError } from '../utils/errors'

export type GenreRow = Pick<Tables<'genres'>, 'id' | 'name' | 'user_id'>

/** Built-in genres + the user's custom genres, sorted by name. */
export async function listGenreRows(db: DbClient, userId: string): Promise<GenreRow[]> {
  const { data, error } = await db
    .from('genres')
    .select('id, name, user_id')
    .or(`user_id.is.null,user_id.eq.${userId}`)
    .order('name')
  if (error) throw toHttpError(error, 'genres.list')
  return data
}

export async function insertGenreRow(db: DbClient, userId: string, name: string): Promise<GenreRow> {
  const { data, error } = await db.from('genres').insert({ user_id: userId, name }).select('id, name, user_id').single()
  if (error) throw toHttpError(error, 'genres.insert')
  return data
}
