import type { Genre } from '~~/shared/types/track'
import { foldCase } from '~~/shared/utils/text'
import type { DbClient } from '../utils/auth'
import * as genresRepo from '../repositories/genres.repository'

/**
 * Genres: a built-in list (seeded by the schema migration) plus the custom
 * genres each user creates on the fly from the edit page.
 */

/** Row → domain type; `custom` tells the UI which genres the user created. */
function toGenre(row: genresRepo.GenreRow): Genre {
  return { id: row.id, name: row.name, custom: row.user_id !== null }
}

/** Built-in + the user's custom genres, sorted by name. */
export async function listGenres(db: DbClient, userId: string): Promise<Genre[]> {
  // Built-in and own genres, sorted by name.
  const rows = await genresRepo.listGenreRows(db, userId)
  return rows.map(toGenre)
}

/**
 * Creates a custom genre. When a genre with the same name already exists
 * (built-in or the user's own, case-insensitive) that one is returned instead.
 */
export async function createGenre(db: DbClient, userId: string, name: string): Promise<Genre> {
  // The requested name, folded like the existing ones for the comparison.
  const wanted = foldCase(name)
  // A built-in or own genre with the same name (ignoring case and spaces) is reused.
  const existing = (await genresRepo.listGenreRows(db, userId)).find(row => foldCase(row.name) === wanted)
  if (existing) return toGenre(existing)
  return toGenre(await genresRepo.insertGenreRow(db, userId, name.trim()))
}
