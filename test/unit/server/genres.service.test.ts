/**
 * Genres service with a mocked repository: the genres with their subgenres,
 * creating a custom subgenre that may exist already or be incoherent, and
 * renaming or deleting one of the user's own (never a built-in one, never
 * another user's), a new name checked like a created one.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DbClient } from '~~/server/utils/auth'
import * as genresRepo from '~~/server/repositories/genres.repository'
import { createSubgenre, deleteSubgenre, listGenres, renameSubgenre } from '~~/server/services/genres.service'

vi.mock('~~/server/repositories/genres.repository')

// The repository is mocked: the client is never used.
const db = {} as DbClient
// The user (the owner of the custom subgenre).
const USER = '11111111-1111-4111-8111-111111111111'

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(genresRepo.listGenreRows).mockResolvedValue([
    { id: 'metal', name: 'Metal' },
    { id: 'pop', name: 'Pop' },
    { id: 'rock', name: 'Rock' },
  ])
  vi.mocked(genresRepo.listSubgenreRows).mockResolvedValue([
    { id: 'bog', genre_id: 'metal', name: 'Bog Metal', user_id: USER },
    { id: 'kpop', genre_id: 'pop', name: 'K-Pop', user_id: null },
    { id: 'thrash', genre_id: 'metal', name: 'Thrash Metal', user_id: null },
  ])
})

describe('listGenres', () => {
  it('gives each genre its subgenres, built-in and own told apart', async () => {
    expect(await listGenres(db, USER)).toEqual([
      {
        id: 'metal',
        name: 'Metal',
        subgenres: [
          { id: 'bog', genreId: 'metal', name: 'Bog Metal', custom: true },
          { id: 'thrash', genreId: 'metal', name: 'Thrash Metal', custom: false },
        ],
      },
      { id: 'pop', name: 'Pop', subgenres: [{ id: 'kpop', genreId: 'pop', name: 'K-Pop', custom: false }] },
      { id: 'rock', name: 'Rock', subgenres: [] },
    ])
    expect(genresRepo.listSubgenreRows).toHaveBeenCalledWith(db, USER)
  })
})

describe('createSubgenre', () => {
  it('returns the genre\'s subgenre with that name, built-in or own, ignoring case and spaces', async () => {
    expect(await createSubgenre(db, USER, 'metal', '  thrash METAL ')).toMatchObject({ id: 'thrash' })
    expect(await createSubgenre(db, USER, 'metal', 'bog metal')).toMatchObject({ id: 'bog' })
    expect(genresRepo.insertSubgenreRow).not.toHaveBeenCalled()
  })

  it('creates a new custom subgenre under the genre', async () => {
    vi.mocked(genresRepo.insertSubgenreRow).mockResolvedValue({ id: 'new', genre_id: 'metal', name: 'Swamp Metal', user_id: USER })

    // A name the genre does not have, with spaces around it.
    const subgenre = await createSubgenre(db, USER, 'metal', ' Swamp Metal ')

    expect(genresRepo.insertSubgenreRow).toHaveBeenCalledWith(db, USER, 'metal', 'Swamp Metal')
    expect(subgenre).toEqual({ id: 'new', genreId: 'metal', name: 'Swamp Metal', custom: true })
  })

  it('refuses, with 409 and the reason, a name incoherent with the genre', async () => {
    await expect(createSubgenre(db, USER, 'pop', 'Thrash Metal'))
      .rejects.toMatchObject({ statusCode: 409, message: 'Thrash Metal belongs to Metal' })
    await expect(createSubgenre(db, USER, 'metal', 'rock'))
      .rejects.toMatchObject({ statusCode: 409, message: 'Rock is a genre, not a subgenre' })
    expect(genresRepo.insertSubgenreRow).not.toHaveBeenCalled()
  })

  it('lets another genre have a subgenre named like one of the user\'s own', async () => {
    vi.mocked(genresRepo.insertSubgenreRow).mockResolvedValue({ id: 'new', genre_id: 'rock', name: 'Bog Metal', user_id: USER })
    // Custom names are only unique within a genre: the user decides where theirs belong.
    await createSubgenre(db, USER, 'rock', 'Bog Metal')
    expect(genresRepo.insertSubgenreRow).toHaveBeenCalledWith(db, USER, 'rock', 'Bog Metal')
  })

  it('responds 404 for a genre that does not exist', async () => {
    await expect(createSubgenre(db, USER, 'polka', 'Fast')).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('renameSubgenre', () => {
  // The user's own subgenre under Metal, as the repository finds it.
  const BOG = { id: 'bog', genre_id: 'metal', name: 'Bog Metal', user_id: USER }

  beforeEach(() => {
    vi.mocked(genresRepo.findSubgenreRow).mockResolvedValue(BOG)
  })

  it('renames one of the user\'s own, trimmed, and stays in its genre', async () => {
    vi.mocked(genresRepo.updateSubgenreName).mockResolvedValue({ ...BOG, name: 'Swamp Metal' })

    const subgenre = await renameSubgenre(db, USER, 'bog', '  Swamp Metal ')

    expect(genresRepo.updateSubgenreName).toHaveBeenCalledWith(db, 'bog', 'Swamp Metal')
    expect(subgenre).toEqual({ id: 'bog', genreId: 'metal', name: 'Swamp Metal', custom: true })
  })

  it('takes its own name in another case: a spelling fix, not a clash with itself', async () => {
    vi.mocked(genresRepo.updateSubgenreName).mockResolvedValue({ ...BOG, name: 'BOG METAL' })
    await renameSubgenre(db, USER, 'bog', 'BOG METAL')
    expect(genresRepo.updateSubgenreName).toHaveBeenCalledWith(db, 'bog', 'BOG METAL')
  })

  it('refuses with 409 a name its genre already has, built-in or own', async () => {
    await expect(renameSubgenre(db, USER, 'bog', 'thrash metal'))
      .rejects.toMatchObject({ statusCode: 409, message: 'Metal already has Thrash Metal' })
    expect(genresRepo.updateSubgenreName).not.toHaveBeenCalled()
  })

  it('refuses with 409 and the reason a name incoherent with its genre', async () => {
    await expect(renameSubgenre(db, USER, 'bog', 'K-Pop'))
      .rejects.toMatchObject({ statusCode: 409, message: 'K-Pop belongs to Pop' })
    await expect(renameSubgenre(db, USER, 'bog', 'Rock'))
      .rejects.toMatchObject({ statusCode: 409, message: 'Rock is a genre, not a subgenre' })
    expect(genresRepo.updateSubgenreName).not.toHaveBeenCalled()
  })

  it('refuses with 403 a built-in subgenre, and 404 an unknown one or another user\'s', async () => {
    vi.mocked(genresRepo.findSubgenreRow).mockResolvedValueOnce({ id: 'thrash', genre_id: 'metal', name: 'Thrash Metal', user_id: null })
    await expect(renameSubgenre(db, USER, 'thrash', 'Trash Metal'))
      .rejects.toMatchObject({ statusCode: 403, message: 'Built-in subgenres cannot be renamed' })
    // RLS hides another user's row: it reads as missing, like an unknown id.
    vi.mocked(genresRepo.findSubgenreRow).mockResolvedValueOnce(null)
    await expect(renameSubgenre(db, USER, 'theirs', 'Mine now')).rejects.toMatchObject({ statusCode: 404 })
    expect(genresRepo.updateSubgenreName).not.toHaveBeenCalled()
  })
})

describe('deleteSubgenre', () => {
  it('deletes one of the user\'s own', async () => {
    vi.mocked(genresRepo.findSubgenreRow).mockResolvedValue({ id: 'bog', genre_id: 'metal', name: 'Bog Metal', user_id: USER })
    vi.mocked(genresRepo.deleteSubgenreRow).mockResolvedValue(true)
    await deleteSubgenre(db, 'bog')
    expect(genresRepo.deleteSubgenreRow).toHaveBeenCalledWith(db, 'bog')
  })

  it('refuses with 403 a built-in subgenre, and 404 an unknown one', async () => {
    vi.mocked(genresRepo.findSubgenreRow).mockResolvedValueOnce({ id: 'thrash', genre_id: 'metal', name: 'Thrash Metal', user_id: null })
    await expect(deleteSubgenre(db, 'thrash'))
      .rejects.toMatchObject({ statusCode: 403, message: 'Built-in subgenres cannot be deleted' })
    vi.mocked(genresRepo.findSubgenreRow).mockResolvedValueOnce(null)
    await expect(deleteSubgenre(db, 'nope')).rejects.toMatchObject({ statusCode: 404 })
    expect(genresRepo.deleteSubgenreRow).not.toHaveBeenCalled()
  })

  it('responds 404 when it went between the check and the deletion', async () => {
    vi.mocked(genresRepo.findSubgenreRow).mockResolvedValue({ id: 'bog', genre_id: 'metal', name: 'Bog Metal', user_id: USER })
    // Deleted meanwhile (another tab): nothing left to delete.
    vi.mocked(genresRepo.deleteSubgenreRow).mockResolvedValue(false)
    await expect(deleteSubgenre(db, 'bog')).rejects.toMatchObject({ statusCode: 404, message: 'Subgenre not found' })
  })
})
