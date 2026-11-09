import type { Genre, Subgenre } from '../types/track'
import { foldCase } from './text'

/**
 * Genres and subgenres by name (GET /api/genres' list): the rules the
 * server, the upload and the metadata import share. Names compare case and
 * spaces aside (foldCase), as the database's unique indexes do.
 *
 * - The genres are a fixed list; every built-in subgenre name is unique
 *   across it, so a name such as "Thrash Metal" says which genre it is in.
 * - A custom subgenre is coherent with its genre: not named like a genre,
 *   nor like a built-in subgenre of another genre (subgenreNameProblem; the
 *   database's private.check_subgenre_name is the safety net).
 */

/** The genre with this name, or undefined. */
export function findGenreByName(genres: readonly Genre[], name: string): Genre | undefined {
  // The name, folded like the genres' for the comparison.
  const wanted = foldCase(name)
  return genres.find(genre => foldCase(genre.name) === wanted)
}

/** One of the genre's subgenres (built-in or the user's own) with this name, or undefined. */
export function findSubgenreByName(genre: Genre, name: string): Subgenre | undefined {
  // The name, folded like the subgenres' for the comparison.
  const wanted = foldCase(name)
  return genre.subgenres.find(subgenre => foldCase(subgenre.name) === wanted)
}

/** A subgenre found by name, with its genre. */
export interface SubgenreMatch {
  /** The genre the subgenre belongs to. */
  genre: Genre
  /** The subgenre found. */
  subgenre: Subgenre
}

/** Every subgenre with this name, in any genre, built-in first. */
function subgenresNamed(genres: readonly Genre[], name: string): SubgenreMatch[] {
  // The name, folded like the subgenres' for the comparison.
  const wanted = foldCase(name)
  // Each genre's subgenres with that name (at most one per genre: names are unique within one).
  const matches = genres.flatMap(genre => genre.subgenres
    .filter(subgenre => foldCase(subgenre.name) === wanted)
    .map(subgenre => ({ genre, subgenre })))
  return matches.sort((a, b) => Number(a.subgenre.custom) - Number(b.subgenre.custom))
}

/** The built-in subgenre with this name (one at most: built-in names are unique), with its genre. */
export function findBuiltinSubgenre(genres: readonly Genre[], name: string): SubgenreMatch | undefined {
  return subgenresNamed(genres, name).find(match => !match.subgenre.custom)
}

/**
 * Why a custom subgenre with this name cannot go under `genre`, or null when
 * it can: "Jazz is a genre, not a subgenre", "Thrash Metal belongs to Metal".
 * A built-in subgenre of `genre` itself is no problem: it is the one to use.
 */
export function subgenreNameProblem(genres: readonly Genre[], genre: Genre, name: string): string | null {
  // A main genre with that name.
  const asGenre = findGenreByName(genres, name)
  if (asGenre) return `${asGenre.name} is a genre, not a subgenre`
  // A built-in subgenre with that name, in whichever genre.
  const builtin = findBuiltinSubgenre(genres, name)
  if (builtin && builtin.genre.id !== genre.id) return `${builtin.subgenre.name} belongs to ${builtin.genre.name}`
  return null
}

/** A track's genre and subgenre, as ids. */
export interface GenreChoice {
  /** One of the fixed list of genres. */
  genreId: string
  /** One of that genre's subgenres, or none (the genre alone). */
  subgenreId: string | null
}

/**
 * The genre and subgenre a single name stands for (a file's genre tag):
 * a main genre (no subgenre); else a built-in subgenre and its genre; else one
 * of the user's own subgenres, when only one genre has a subgenre with that
 * name. Null when nothing matches, or the name is ambiguous.
 */
export function resolveGenreName(genres: readonly Genre[], name: string): GenreChoice | null {
  if (!name.trim()) return null
  // A main genre with that name: the genre alone.
  const genre = findGenreByName(genres, name)
  if (genre) return { genreId: genre.id, subgenreId: null }
  // Subgenres with that name: one built-in, or the user's own in one genre only.
  const matches = subgenresNamed(genres, name)
  // The built-in one first (one at most); else the user's own, if no other genre has one so named.
  const match = matches.find(m => !m.subgenre.custom) ?? (matches.length === 1 ? matches[0] : undefined)
  return match ? { genreId: match.genre.id, subgenreId: match.subgenre.id } : null
}
