import type { Genre } from '~~/shared/types/track'
import type { DbClient } from '../utils/auth'
import * as genresRepo from '../repositories/genres.repository'

function toGenre(row: genresRepo.GenreRow): Genre {
  return { id: row.id, name: row.name, custom: row.user_id !== null }
}

export async function listGenres(db: DbClient, userId: string): Promise<Genre[]> {
  const rows = await genresRepo.listGenreRows(db, userId)
  return rows.map(toGenre)
}

/**
 * Creates a custom genre. When a genre with the same name already exists
 * (built-in or the user's own, case-insensitive) that one is returned instead.
 */
export async function createGenre(db: DbClient, userId: string, name: string): Promise<Genre> {
  const normalized = name.trim().toLocaleLowerCase('en')
  const existing = (await genresRepo.listGenreRows(db, userId))
    .find(row => row.name.trim().toLocaleLowerCase('en') === normalized)
  if (existing) return toGenre(existing)
  return toGenre(await genresRepo.insertGenreRow(db, userId, name.trim()))
}
