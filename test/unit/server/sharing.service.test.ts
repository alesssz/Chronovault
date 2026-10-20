import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SharedTrackRow } from '~~/server/mappers/track'
import type { DbClient } from '~~/server/utils/auth'
import type { AudioStorage } from '~~/server/repositories/audio-storage'
import { findSharedTrackRow } from '~~/server/repositories/shared-tracks.repository'
import * as storageRepo from '~~/server/repositories/storage.repository'
import { getSharedCoverUrl, getSharedPlaybackSource, getSharedTrack } from '~~/server/services/sharing.service'

vi.mock('~~/server/repositories/shared-tracks.repository')
vi.mock('~~/server/repositories/storage.repository', async (importOriginal) => {
  const original = await importOriginal<typeof storageRepo>()
  return { SIGNED_URL_TTL: original.SIGNED_URL_TTL, createSignedUrl: vi.fn() }
})

const db = {} as DbClient
const USER = '11111111-1111-4111-8111-111111111111'
const TRACK = '22222222-2222-4222-8222-222222222222'
const AUDIO = `${USER}/${TRACK}.flac`
const COVER = `${USER}/${TRACK}.webp`

function makeRow(overrides: Partial<SharedTrackRow> = {}): SharedTrackRow {
  return {
    id: TRACK, title: 'Artemisia', composers: 'Chronovault', album: 'Baroque', year: 2026, genre: 'Ambient',
    description: 'About it', lyrics: '[Intro]\nla la', lyrics_synced: [{ time: 1, text: 'la la' }],
    duration_seconds: 200, peaks: [0.5], cover_path: COVER, audio_path: AUDIO, visibility: 'unlisted',
    updated_at: '2026-10-18T10:00:00Z',
    ...overrides,
  }
}

const presign = vi.fn(async (method: string, key: string) => `https://r2.test/${key}?method=${method}`)
const audio = { presign } as unknown as AudioStorage

beforeEach(() => {
  vi.resetAllMocks()
  presign.mockImplementation(async (method: string, key: string) => `https://r2.test/${key}?method=${method}`)
  vi.mocked(storageRepo.createSignedUrl).mockResolvedValue('https://signed/cover')
})

describe('getSharedTrack', () => {
  it('returns the shareable fields and a signed cover', async () => {
    vi.mocked(findSharedTrackRow).mockResolvedValue(makeRow())

    const track = await getSharedTrack(db, TRACK)

    expect(track).toMatchObject({ id: TRACK, title: 'Artemisia', genre: 'Ambient', coverUrl: 'https://signed/cover' })
    expect(storageRepo.createSignedUrl).toHaveBeenCalledWith(db, 'covers', COVER)
  })

  it('answers 404 for a missing or private track (the function returns nothing)', async () => {
    vi.mocked(findSharedTrackRow).mockResolvedValue(null)
    await expect(getSharedTrack(db, TRACK)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('still works when the cover cannot be signed', async () => {
    vi.mocked(findSharedTrackRow).mockResolvedValue(makeRow())
    vi.mocked(storageRepo.createSignedUrl).mockRejectedValue(new Error('storage down'))
    expect((await getSharedTrack(db, TRACK)).coverUrl).toBeNull()
  })
})

describe('getSharedPlaybackSource', () => {
  it('presigns a GET of the audio file for six hours', async () => {
    vi.mocked(findSharedTrackRow).mockResolvedValue(makeRow())

    const source = await getSharedPlaybackSource(db, audio, TRACK)

    expect(presign).toHaveBeenCalledWith('GET', AUDIO, storageRepo.SIGNED_URL_TTL)
    expect(source.url).toBe(`https://r2.test/${AUDIO}?method=GET`)
    expect(Date.parse(source.expiresAt)).toBeGreaterThan(Date.now())
  })

  it('never signs anything for a missing or private track', async () => {
    vi.mocked(findSharedTrackRow).mockResolvedValue(null)
    await expect(getSharedPlaybackSource(db, audio, TRACK)).rejects.toMatchObject({ statusCode: 404 })
    expect(presign).not.toHaveBeenCalled()
  })
})

describe('getSharedCoverUrl', () => {
  it('returns a fresh signed URL of the cover', async () => {
    vi.mocked(findSharedTrackRow).mockResolvedValue(makeRow())
    expect(await getSharedCoverUrl(db, TRACK)).toBe('https://signed/cover')
  })

  it('answers 404 when the track has no cover', async () => {
    vi.mocked(findSharedTrackRow).mockResolvedValue(makeRow({ cover_path: null }))
    await expect(getSharedCoverUrl(db, TRACK)).rejects.toMatchObject({ statusCode: 404 })
  })
})
