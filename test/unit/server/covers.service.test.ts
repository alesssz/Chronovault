/**
 * Cacheable covers: the versioned addresses (mappers/cover-urls.ts) and the
 * service that reads the image behind them, with mocked repositories.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DbClient } from '~~/server/utils/auth'
import * as tracksRepo from '~~/server/repositories/tracks.repository'
import * as playlistsRepo from '~~/server/repositories/playlists.repository'
import * as storageRepo from '~~/server/repositories/storage.repository'
import { playlistCoverUrl, trackCoverUrl } from '~~/server/mappers/cover-urls'
import { getPlaylistCover, getTrackCover } from '~~/server/services/covers.service'

vi.mock('~~/server/repositories/tracks.repository', () => ({ findTrackCoverPath: vi.fn() }))
vi.mock('~~/server/repositories/playlists.repository', () => ({ findPlaylistCoverPath: vi.fn() }))
vi.mock('~~/server/repositories/storage.repository', () => ({ downloadObject: vi.fn() }))

// The repositories are mocked: the client is never used.
const db = {} as DbClient
const USER = '11111111-1111-4111-8111-111111111111'
const TRACK = '22222222-2222-4222-8222-222222222222'
const PLAYLIST = '33333333-3333-4333-8333-333333333333'
const COVER = `${USER}/${TRACK}.webp`

beforeEach(() => {
  vi.resetAllMocks()
})

describe('cover addresses', () => {
  it('stay the same for the same updated_at and change when it changes', () => {
    const a = trackCoverUrl(TRACK, '2026-10-20T10:00:00Z')
    expect(a).toBe(trackCoverUrl(TRACK, '2026-10-20T10:00:00.000Z'))
    expect(a).not.toBe(trackCoverUrl(TRACK, '2026-10-20T10:00:01Z'))
    expect(a).toMatch(new RegExp(`^/api/covers/tracks/${TRACK}\\?v=[0-9a-z]+$`))
  })

  it('point playlists to their own route', () => {
    expect(playlistCoverUrl(PLAYLIST, '2026-10-20T10:00:00Z')).toMatch(`/api/covers/playlists/${PLAYLIST}?v=`)
  })

  it('fall back to a fixed version for an unreadable timestamp', () => {
    expect(trackCoverUrl(TRACK, '')).toBe(`/api/covers/tracks/${TRACK}?v=0`)
  })
})

describe('getTrackCover', () => {
  it('reads the cover with the user\'s client and returns bytes and type', async () => {
    vi.mocked(tracksRepo.findTrackCoverPath).mockResolvedValue(COVER)
    vi.mocked(storageRepo.downloadObject).mockResolvedValue(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' }))

    const cover = await getTrackCover(db, USER, TRACK)

    expect(tracksRepo.findTrackCoverPath).toHaveBeenCalledWith(db, USER, TRACK)
    expect(storageRepo.downloadObject).toHaveBeenCalledWith(db, 'covers', COVER)
    expect([...cover.bytes]).toEqual([1, 2, 3])
    expect(cover.contentType).toBe('image/webp')
  })

  it('falls back to WebP when storage reports no image type', async () => {
    vi.mocked(tracksRepo.findTrackCoverPath).mockResolvedValue(COVER)
    vi.mocked(storageRepo.downloadObject).mockResolvedValue(new Blob([new Uint8Array([1])]))
    expect((await getTrackCover(db, USER, TRACK)).contentType).toBe('image/webp')
  })

  it('answers 404 when the track has no cover (or is someone else\'s)', async () => {
    vi.mocked(tracksRepo.findTrackCoverPath).mockResolvedValue(null)
    await expect(getTrackCover(db, USER, TRACK)).rejects.toMatchObject({ statusCode: 404 })
    expect(storageRepo.downloadObject).not.toHaveBeenCalled()
  })

  it('answers 404 when the file cannot be read', async () => {
    vi.mocked(tracksRepo.findTrackCoverPath).mockResolvedValue(COVER)
    vi.mocked(storageRepo.downloadObject).mockResolvedValue(null)
    await expect(getTrackCover(db, USER, TRACK)).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('getPlaylistCover', () => {
  it('reads the playlist\'s custom cover', async () => {
    const path = `${USER}/playlists/${PLAYLIST}.webp`
    vi.mocked(playlistsRepo.findPlaylistCoverPath).mockResolvedValue(path)
    vi.mocked(storageRepo.downloadObject).mockResolvedValue(new Blob([new Uint8Array([9])], { type: 'image/webp' }))

    await getPlaylistCover(db, USER, PLAYLIST)

    expect(playlistsRepo.findPlaylistCoverPath).toHaveBeenCalledWith(db, USER, PLAYLIST)
    expect(storageRepo.downloadObject).toHaveBeenCalledWith(db, 'covers', path)
  })
})
