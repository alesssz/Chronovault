/**
 * Genres and subgenres by name: lookups, a custom subgenre's coherence with
 * its genre, and what a file's genre tag stands for.
 */
import { describe, expect, it } from 'vitest'
import type { Genre } from '~~/shared/types/track'
import { findBuiltinSubgenre, findGenreByName, findSubgenreByName, resolveGenreName, subgenreNameProblem } from '~~/shared/utils/genres'

/** Three genres: built-in subgenres, and the user's own in two of them under one name. */
const GENRES: Genre[] = [
  {
    id: 'metal',
    name: 'Metal',
    subgenres: [
      { id: 'bog-m', genreId: 'metal', name: 'Bog', custom: true },
      { id: 'mine-m', genreId: 'metal', name: 'Mine', custom: true },
      { id: 'thrash', genreId: 'metal', name: 'Thrash Metal', custom: false },
    ],
  },
  {
    id: 'electronic',
    name: 'Electronic',
    subgenres: [{ id: 'techno', genreId: 'electronic', name: 'Techno', custom: false }],
  },
  {
    id: 'rock',
    name: 'Rock',
    subgenres: [{ id: 'bog-r', genreId: 'rock', name: 'Bog', custom: true }],
  },
]
// The genres the tests name: Metal (two of the user's own) and Electronic.
const [METAL, ELECTRONIC] = GENRES as [Genre, Genre, Genre]

describe('lookups by name', () => {
  it('find genres and subgenres case and spaces aside', () => {
    expect(findGenreByName(GENRES, '  metal ')?.id).toBe('metal')
    expect(findGenreByName(GENRES, 'Thrash Metal')).toBeUndefined()
    expect(findSubgenreByName(METAL, 'THRASH metal')?.id).toBe('thrash')
    expect(findSubgenreByName(ELECTRONIC, 'Thrash Metal')).toBeUndefined()
  })

  it('find a built-in subgenre in whichever genre, never a custom one', () => {
    expect(findBuiltinSubgenre(GENRES, 'techno')).toMatchObject({ genre: { id: 'electronic' }, subgenre: { id: 'techno' } })
    expect(findBuiltinSubgenre(GENRES, 'Bog')).toBeUndefined()
  })
})

describe('subgenreNameProblem', () => {
  it('refuses a genre\'s name, and a built-in subgenre of another genre', () => {
    expect(subgenreNameProblem(GENRES, METAL, ' rock ')).toBe('Rock is a genre, not a subgenre')
    expect(subgenreNameProblem(GENRES, METAL, 'techno')).toBe('Techno belongs to Electronic')
  })

  it('accepts a new name, the genre\'s own built-in one, and a custom name used in another genre', () => {
    expect(subgenreNameProblem(GENRES, METAL, 'Swamp Metal')).toBeNull()
    expect(subgenreNameProblem(GENRES, METAL, 'thrash metal')).toBeNull()
    expect(subgenreNameProblem(GENRES, ELECTRONIC, 'Bog')).toBeNull()
  })
})

describe('resolveGenreName', () => {
  it('takes a genre alone, or a built-in subgenre with its genre', () => {
    expect(resolveGenreName(GENRES, 'ROCK')).toEqual({ genreId: 'rock', subgenreId: null })
    expect(resolveGenreName(GENRES, 'Techno')).toEqual({ genreId: 'electronic', subgenreId: 'techno' })
  })

  it('takes one of the user\'s own subgenres only when one genre has that name', () => {
    expect(resolveGenreName(GENRES, 'mine')).toEqual({ genreId: 'metal', subgenreId: 'mine-m' })
    expect(resolveGenreName(GENRES, 'Bog')).toBeNull()
  })

  it('gives nothing for an unknown or empty name', () => {
    expect(resolveGenreName(GENRES, 'Vaporwave')).toBeNull()
    expect(resolveGenreName(GENRES, '  ')).toBeNull()
  })
})
