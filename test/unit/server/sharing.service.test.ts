/**
 * Public sharing service with mocked repositories: shared tracks and playlists, 404 for private
 * items, audio signed only through the playlist a track belongs to, preview covers.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SharedTrackRow } from '~~/server/mappers/track'
import type { SharedPlaylistRow, SharedPlaylistTrackRow } from '~~/server/mappers/playlist'
import type { DbClient } from '~~/server/utils/auth'
import type { AudioStorage } from '~~/server/repositories/audio-storage'
import { findSharedPlaylistRow, findSharedTrackRow, listSharedPlaylistTrackRows } from '~~/server/repositories/sharing.repository'
import * as storageRepo from '~~/server/repositories/storage.repository'
import {
  getSharedCoverUrl,
  getSharedPlaybackSource,
  getSharedPlaylist,
  getSharedPlaylistCoverUrl,
  getSharedPlaylistPlaybackSource,
  getSharedTrack,
} from '~~/server/services/sharing.service'

vi.mock('~~/server/repositories/sharing.repository')
vi.mock('~~/server/repositories/storage.repository', async (importOriginal) => {
  const original = await importOriginal<typeof storageRepo>()
  return { SIGNED_URL_TTL: original.SIGNED_URL_TTL, createSignedUrl: vi.fn(), createSignedUrls: vi.fn() }
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
  vi.mocked(storageRepo.createSignedUrls).mockImplementation(async (_db, _bucket, paths) =>
    new Map(paths.map(p => [p, `https://signed/${p}`])))
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

describe('shared playlists', () => {
  const PLAYLIST = '33333333-3333-4333-8333-333333333333'
  const PRIVATE = '44444444-4444-4444-8444-444444444444'
  const playlistRow = {
    id: PLAYLIST, title: 'Night drive', description: 'Late songs', cover_path: null,
    visibility: 'unlisted', updated_at: '2026-10-20T10:00:00Z',
  } as unknown as SharedPlaylistRow

  function playlistTrack(id: string, position: number, cover: string | null): SharedPlaylistTrackRow {
    const { visibility: _v, ...row } = makeRow({ id, cover_path: cover as string, audio_path: `${USER}/${id}.flac` })
    return { ...row, position }
  }

  const tracks = [playlistTrack(TRACK, 0, COVER), playlistTrack(PRIVATE, 1, null)]

  it('lists every track in order, with signed covers and the mosaic', async () => {
    vi.mocked(findSharedPlaylistRow).mockResolvedValue(playlistRow)
    vi.mocked(listSharedPlaylistTrackRows).mockResolvedValue(tracks)

    const playlist = await getSharedPlaylist(db, PLAYLIST)

    expect(playlist.tracks.map(t => t.id)).toEqual([TRACK, PRIVATE])
    expect(playlist.tracks[0]!.coverUrl).toBe(`https://signed/${COVER}`)
    expect(playlist.mosaic).toEqual([`https://signed/${COVER}`])
    expect(playlist.durationSeconds).toBe(400)
    expect(JSON.stringify(playlist)).not.toMatch(/audio_?[pP]ath|sunoPrompt|mastered|\.flac/)
  })

  it('answers 404 for a missing or private playlist', async () => {
    vi.mocked(findSharedPlaylistRow).mockResolvedValue(null)
    await expect(getSharedPlaylist(db, PLAYLIST)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('signs the audio of a track (even a private one) only through its playlist', async () => {
    vi.mocked(listSharedPlaylistTrackRows).mockResolvedValue(tracks)

    const source = await getSharedPlaylistPlaybackSource(db, audio, PLAYLIST, PRIVATE)
    expect(source.url).toBe(`https://r2.test/${USER}/${PRIVATE}.flac?method=GET`)

    await expect(getSharedPlaylistPlaybackSource(db, audio, PLAYLIST, '55555555-5555-4555-8555-555555555555'))
      .rejects.toMatchObject({ statusCode: 404 })
    expect(presign).toHaveBeenCalledTimes(1)
  })

  it('uses the first track cover for link previews when there is no custom cover', async () => {
    vi.mocked(findSharedPlaylistRow).mockResolvedValue(playlistRow)
    vi.mocked(listSharedPlaylistTrackRows).mockResolvedValue(tracks)

    await getSharedPlaylistCoverUrl(db, PLAYLIST)

    expect(storageRepo.createSignedUrl).toHaveBeenCalledWith(db, 'covers', COVER)
  })
})
