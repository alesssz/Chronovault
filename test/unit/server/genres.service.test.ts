import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DbClient } from '~~/server/utils/auth'
import * as genresRepo from '~~/server/repositories/genres.repository'
import { createGenre, listGenres } from '~~/server/services/genres.service'

vi.mock('~~/server/repositories/genres.repository')

const db = {} as DbClient
const USER = '11111111-1111-4111-8111-111111111111'

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(genresRepo.listGenreRows).mockResolvedValue([
    { id: 'g1', name: 'Pop', user_id: null },
    { id: 'g2', name: 'Synthwave', user_id: USER },
  ])
})

describe('listGenres', () => {
  it('tells built-in and custom genres apart', async () => {
    expect(await listGenres(db, USER)).toEqual([
      { id: 'g1', name: 'Pop', custom: false },
      { id: 'g2', name: 'Synthwave', custom: true },
    ])
  })
})

describe('createGenre', () => {
  it('returns the existing genre ignoring case and spaces', async () => {
    const genre = await createGenre(db, USER, '  pop ')
    expect(genre).toEqual({ id: 'g1', name: 'Pop', custom: false })
    expect(genresRepo.insertGenreRow).not.toHaveBeenCalled()
  })

  it('creates a new custom genre', async () => {
    vi.mocked(genresRepo.insertGenreRow).mockResolvedValue({ id: 'g3', name: 'Vaporwave', user_id: USER })
    const genre = await createGenre(db, USER, ' Vaporwave ')
    expect(genresRepo.insertGenreRow).toHaveBeenCalledWith(db, USER, 'Vaporwave')
    expect(genre).toEqual({ id: 'g3', name: 'Vaporwave', custom: true })
  })
})
