import type { Genre, Subgenre } from '~~/shared/types/track'
import { findSubgenreByName, subgenreNameProblem } from '~~/shared/utils/genres'
import type { DbClient } from '../utils/auth'
import { conflict, forbidden, notFound } from '../utils/errors'
import * as genresRepo from '../repositories/genres.repository'

/**
 * Genres and subgenres: a fixed list of genres and their built-in subgenres
 * (seeded by …_subgenres.sql), plus the custom subgenres each user creates
 * on the fly from the editor or the metadata import, under one genre, and
 * may later rename (a typo) or delete (one no track needs any more).
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

/**
 * One of the user's own subgenres, for a rename or a deletion: 404 for an
 * unknown id or another user's (never revealing it exists), 403 for a
 * built-in one, which every user shares and none may change.
 */
async function ownSubgenreRow(db: DbClient, id: string, action: 'renamed' | 'deleted'): Promise<genresRepo.SubgenreRow> {
  // The row, if the user can see it (built-in or their own).
  const row = await genresRepo.findSubgenreRow(db, id)
  if (!row) throw notFound('Subgenre not found')
  if (row.user_id === null) throw forbidden(`Built-in subgenres cannot be ${action}`)
  return row
}

/**
 * Renames one of the user's own subgenres; it stays in its genre, and its
 * tracks show the new name (they point to it by id). The name is checked as a
 * new one would be (createSubgenre): 409 when its genre already has a
 * subgenre with that name, built-in or own ("Metal already has Thrash
 * Metal": two would be told apart by nothing), or when the name is a genre's
 * or another genre's built-in subgenre. The same name in another case or with
 * other spaces is a plain rename ("swamp metal" → "Swamp Metal").
 * 404 / 403 as ownSubgenreRow.
 */
export async function renameSubgenre(db: DbClient, userId: string, id: string, name: string): Promise<Subgenre> {
  // The user's own row (404 / 403 otherwise): its genre is the one the name is checked in.
  const row = await ownSubgenreRow(db, id, 'renamed')
  // The new name as stored (the schema trims it too; the service may be called directly).
  const newName = name.trim()
  // Every genre with its subgenres: the checks look across all of them.
  const genres = await listGenres(db, userId)
  // The subgenre's genre (always there: genres are a fixed list, and a subgenre cannot move).
  const genre = genres.find(g => g.id === row.genre_id)
  if (!genre) throw notFound('Genre not found')

  // Another subgenre of the genre with that name: renaming would make two alike.
  const existing = findSubgenreByName(genre, newName)
  if (existing && existing.id !== id) throw conflict(`${genre.name} already has ${existing.name}`)

  // A name that is a genre's, or another genre's built-in subgenre.
  const problem = subgenreNameProblem(genres, genre, newName)
  if (problem) throw conflict(problem)

  return toSubgenre(await genresRepo.updateSubgenreName(db, id, newName))
}

/**
 * Deletes one of the user's own subgenres. Its tracks keep their genre, with
 * no subgenre (the database clears it). 404 / 403 as ownSubgenreRow.
 */
export async function deleteSubgenre(db: DbClient, id: string): Promise<void> {
  // Read first: RLS alone would delete nothing for a built-in subgenre and an unknown id
  // alike, and the user is told which (403 says why, 404 says it is not there).
  await ownSubgenreRow(db, id, 'deleted')
  // Gone between the check and now (another tab): the same answer as an unknown id.
  if (!await genresRepo.deleteSubgenreRow(db, id)) throw notFound('Subgenre not found')
}
