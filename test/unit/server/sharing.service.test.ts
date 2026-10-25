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
  // The real module, for its SIGNED_URL_TTL.
  const original = await importOriginal<typeof storageRepo>()
  return { SIGNED_URL_TTL: original.SIGNED_URL_TTL, createSignedUrl: vi.fn(), createSignedUrls: vi.fn() }
})

// The repositories are mocked: the client is never used, any object will do.
const db = {} as DbClient
// Fixed ids and the storage paths they lead to (the format checks only care about the shape).
const USER = '11111111-1111-4111-8111-111111111111'
const TRACK = '22222222-2222-4222-8222-222222222222'
const AUDIO = `${USER}/${TRACK}.flac`
const COVER = `${USER}/${TRACK}.webp`

/** A row as get_shared_track() returns it (unlisted, with a cover). */
function makeRow(overrides: Partial<SharedTrackRow> = {}): SharedTrackRow {
  return {
    id: TRACK, title: 'Artemisia', composers: 'Chronovault', album: 'Baroque', year: 2026, genre: 'Ambient',
    description: 'About it', lyrics: '[Intro]\nla la', lyrics_synced: [{ time: 1, text: 'la la' }],
    duration_seconds: 200, peaks: [0.5], cover_path: COVER, audio_path: AUDIO, visibility: 'unlisted',
    updated_at: '2026-10-18T10:00:00Z',
    ...overrides,
  }
}

// The fake signer: the address is just the key, so the tests can read which file was signed.
const streamUrl = vi.fn(async (key: string) => `/api/stream?k=${key}`)
/** Fake R2 client: streaming addresses are predictable strings. */
const audio = { streamUrl } as unknown as AudioStorage

beforeEach(() => {
  vi.resetAllMocks()
  streamUrl.mockImplementation(async (key: string) => `/api/stream?k=${key}`)
  vi.mocked(storageRepo.createSignedUrl).mockResolvedValue('https://signed/cover')
  vi.mocked(storageRepo.createSignedUrls).mockImplementation(async (_db, _bucket, paths) =>
    new Map(paths.map(p => [p, `https://signed/${p}`])))
})

describe('getSharedTrack', () => {
  it('returns the shareable fields and a signed cover', async () => {
    vi.mocked(findSharedTrackRow).mockResolvedValue(makeRow())

    // The track as its share page gets it.
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
  it('hands out a streaming address of the audio file for six hours', async () => {
    vi.mocked(findSharedTrackRow).mockResolvedValue(makeRow())

    // The streaming address of the shared track.
    const source = await getSharedPlaybackSource(db, audio, TRACK)

    expect(streamUrl).toHaveBeenCalledWith(AUDIO, storageRepo.SIGNED_URL_TTL)
    expect(source.url).toBe(`/api/stream?k=${AUDIO}`)
    expect(Date.parse(source.expiresAt)).toBeGreaterThan(Date.now())
  })

  it('never signs anything for a missing or private track', async () => {
    vi.mocked(findSharedTrackRow).mockResolvedValue(null)
    await expect(getSharedPlaybackSource(db, audio, TRACK)).rejects.toMatchObject({ statusCode: 404 })
    expect(streamUrl).not.toHaveBeenCalled()
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
  // A shared playlist holding one unlisted track and one private track.
  const PLAYLIST = '33333333-3333-4333-8333-333333333333'
  // The private track of the shared playlist.
  const PRIVATE = '44444444-4444-4444-8444-444444444444'
  /** The shared (unlisted) playlist row, without a custom cover. */
  const playlistRow = {
    id: PLAYLIST, purpose: 'playlist', title: 'Night drive', description: 'Late songs', cover_path: null,
    visibility: 'unlisted', updated_at: '2026-10-20T10:00:00Z',
  } as unknown as SharedPlaylistRow

  /** A row as get_shared_playlist_tracks() returns it. */
  function playlistTrack(id: string, position: number, cover: string | null): SharedPlaylistTrackRow {
    const { visibility: _v, ...row } = makeRow({ id, cover_path: cover as string, audio_path: `${USER}/${id}.flac` })
    return { ...row, position }
  }

  /** Its tracks in order: the unlisted one (with a cover), then the private one. */
  const tracks = [playlistTrack(TRACK, 0, COVER), playlistTrack(PRIVATE, 1, null)]

  it('lists every track in order, with signed covers and the mosaic', async () => {
    vi.mocked(findSharedPlaylistRow).mockResolvedValue(playlistRow)
    vi.mocked(listSharedPlaylistTrackRows).mockResolvedValue(tracks)

    // The playlist as its share page gets it.
    const playlist = await getSharedPlaylist(db, PLAYLIST)

    expect(playlist.tracks.map(t => t.id)).toEqual([TRACK, PRIVATE])
    expect(playlist.tracks[0]!.coverUrl).toBe(`https://signed/${COVER}`)
    expect(playlist.mosaic).toEqual([`https://signed/${COVER}`])
    expect(playlist.durationSeconds).toBe(400)
    expect(JSON.stringify(playlist)).not.toMatch(/audio_?[pP]ath|sunoPrompt|mastered|\.flac/)
  })

  it('tells a group of versions from a playlist (the page words it differently)', async () => {
    vi.mocked(findSharedPlaylistRow).mockResolvedValue({ ...playlistRow, purpose: 'versions' })
    vi.mocked(listSharedPlaylistTrackRows).mockResolvedValue(tracks)

    expect((await getSharedPlaylist(db, PLAYLIST)).purpose).toBe('versions')
  })

  it('answers 404 for a missing or private playlist', async () => {
    vi.mocked(findSharedPlaylistRow).mockResolvedValue(null)
    await expect(getSharedPlaylist(db, PLAYLIST)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('signs the audio of a track (even a private one) only through its playlist', async () => {
    vi.mocked(listSharedPlaylistTrackRows).mockResolvedValue(tracks)

    // The private track's address, asked for through the shared playlist.
    const source = await getSharedPlaylistPlaybackSource(db, audio, PLAYLIST, PRIVATE)
    expect(source.url).toBe(`/api/stream?k=${USER}/${PRIVATE}.flac`)

    await expect(getSharedPlaylistPlaybackSource(db, audio, PLAYLIST, '55555555-5555-4555-8555-555555555555'))
      .rejects.toMatchObject({ statusCode: 404 })
    expect(streamUrl).toHaveBeenCalledTimes(1)
  })

  it('uses the first track cover for link previews when there is no custom cover', async () => {
    vi.mocked(findSharedPlaylistRow).mockResolvedValue(playlistRow)
    vi.mocked(listSharedPlaylistTrackRows).mockResolvedValue(tracks)

    await getSharedPlaylistCoverUrl(db, PLAYLIST)

    expect(storageRepo.createSignedUrl).toHaveBeenCalledWith(db, 'covers', COVER)
  })
})
