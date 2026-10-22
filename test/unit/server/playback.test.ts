/**
 * Storage steps shared by the services: presigned playback URLs and cover file removal.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DbClient } from '~~/server/utils/auth'
import type { AudioStorage } from '~~/server/repositories/audio-storage'
import * as storageRepo from '~~/server/repositories/storage.repository'
import { presignPlayback, removeCoverFiles } from '~~/server/services/playback'

vi.mock('~~/server/repositories/storage.repository', async (importOriginal) => {
  const original = await importOriginal<typeof storageRepo>()
  return { SIGNED_URL_TTL: original.SIGNED_URL_TTL, removeObjects: vi.fn() }
})

// The repository is mocked: the client is never used.
const db = {} as DbClient

beforeEach(() => {
  vi.resetAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('presignPlayback', () => {
  it('signs a GET for SIGNED_URL_TTL and reports when it expires', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-22T10:00:00Z'))
    const presign = vi.fn(async () => 'https://r2.test/signed')
    const audio = { presign } as unknown as AudioStorage

    const source = await presignPlayback(audio, 'user/track.flac')

    expect(presign).toHaveBeenCalledWith('GET', 'user/track.flac', storageRepo.SIGNED_URL_TTL)
    expect(source).toEqual({
      url: 'https://r2.test/signed',
      expiresAt: new Date(Date.parse('2026-10-22T10:00:00Z') + storageRepo.SIGNED_URL_TTL * 1000).toISOString(),
    })
  })
})

describe('removeCoverFiles', () => {
  it('removes the given covers from the covers bucket, skipping empty paths', async () => {
    await removeCoverFiles(db, ['a.webp', null, undefined, 'b.webp'])
    expect(storageRepo.removeObjects).toHaveBeenCalledWith(db, 'covers', ['a.webp', 'b.webp'])
  })

  it('sends nothing when there is no cover', async () => {
    await removeCoverFiles(db, [null])
    expect(storageRepo.removeObjects).not.toHaveBeenCalled()
  })
})
