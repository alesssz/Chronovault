import type { Genre, Subgenre } from '~~/shared/types/track'
import { findSubgenreByName, subgenreNameProblem } from '~~/shared/utils/genres'
import type { DbClient } from '../utils/auth'
import { conflict, notFound } from '../utils/errors'
import * as genresRepo from '../repositories/genres.repository'

/**
 * Genres and subgenres: a fixed list of genres and their built-in subgenres
 * (seeded by …_subgenres.sql), plus the custom subgenres each user creates
 * on the fly from the editor or the metadata import, under one genre.
 */

/** Row → domain type; `custom` tells the UI which subgenres the user created. */
function toSubgenre(row: genresRepo.SubgenreRow): Subgenre {
  return { id: row.id, genreId: row.genre_id, name: row.name, custom: row.user_id !== null }
}

/** The genres, sorted by name, each with its built-in and the user's own subgenres, sorted by name. */
export async function listGenres(db: DbClient, userId: string): Promise<Genre[]> {
  // The two lists, read at once: they do not depend on each other.
  const [genreRows, subgenreRows] = await Promise.all([
    genresRepo.listGenreRows(db),
    genresRepo.listSubgenreRows(db, userId),
  ])
  // Each genre's subgenres, in the rows' order (by name).
  const byGenre = new Map<string, Subgenre[]>()
  for (const row of subgenreRows) {
    // The genre's list so far (a new one for its first subgenre).
    const list = byGenre.get(row.genre_id) ?? []
    list.push(toSubgenre(row))
    byGenre.set(row.genre_id, list)
  }
  return genreRows.map(row => ({ id: row.id, name: row.name, subgenres: byGenre.get(row.id) ?? [] }))
}

/**
 * Creates a custom subgenre under a genre. A subgenre of that genre with the
 * same name (built-in or the user's own, case and spaces aside) is returned
 * instead. 404 for an unknown genre; 409 for a name incoherent with the genre
 * ("Thrash Metal belongs to Metal"), the message shown to the user.
 */
export async function createSubgenre(db: DbClient, userId: string, genreId: string, name: string): Promise<Subgenre> {
  // Every genre with its subgenres: the coherence check looks across all of them.
  const genres = await listGenres(db, userId)
  // The genre asked for.
  const genre = genres.find(g => g.id === genreId)
  if (!genre) throw notFound('Genre not found')

  // The genre's subgenre with that name, built-in or own, is the one to use.
  const existing = findSubgenreByName(genre, name)
  if (existing) return existing

  // A name that is a genre's, or another genre's built-in subgenre.
  const problem = subgenreNameProblem(genres, genre, name)
  if (problem) throw conflict(problem)

  return toSubgenre(await genresRepo.insertSubgenreRow(db, userId, genre.id, name.trim()))
}
