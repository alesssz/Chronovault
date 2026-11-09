/**
 * Playlists service with mocked repositories: ordering, covers and mosaic, private-track count,
 * lists and creation by purpose (playlists / groups of versions, undone when the first tracks are
 * refused), cover path checks and clean-up,
 * appending (the 1000-track limit checked first, with a readable message) and replacing tracks, 404s.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlaylistRow } from '~~/server/mappers/playlist'
import type { TrackSummaryRow } from '~~/server/mappers/track'
import type { DbClient } from '~~/server/utils/auth'
import { MAX_PLAYLIST_TRACKS } from '~~/shared/schemas/playlist'
import * as playlistsRepo from '~~/server/repositories/playlists.repository'
import * as storageRepo from '~~/server/repositories/storage.repository'
import {
  addPlaylistTracks,
  createPlaylist,
  deletePlaylist,
  getPlaylist,
  listPlaylists,
  setPlaylistTracks,
  updatePlaylist,
} from '~~/server/services/playlists.service'

vi.mock('~~/server/repositories/playlists.repository', async (importOriginal) => {
  // The real module, for the pure orderedTracks.
  const original = await importOriginal<typeof playlistsRepo>()
  return {
    orderedTracks: original.orderedTracks,
    listPlaylistRows: vi.fn(),
    findPlaylistRow: vi.fn(),
    findPlaylistTrackIds: vi.fn(),
    insertPlaylistRow: vi.fn(),
    updatePlaylistRow: vi.fn(),
    deletePlaylistRow: vi.fn(),
    setPlaylistTrackIds: vi.fn(),
    appendPlaylistTrackIds: vi.fn(),
  }
})
vi.mock('~~/server/repositories/storage.repository', () => ({
  removeObjects: vi.fn(),
}))

// The repositories are mocked: the client is never used.
const db = {} as DbClient
// Fixed ids and the storage paths they lead to (the format checks only care about the shape).
const USER = '11111111-1111-4111-8111-111111111111'
const PLAYLIST = '33333333-3333-4333-8333-333333333333'
// Three tracks of the user.
const T1 = 'a1111111-1111-4111-8111-111111111111'
const T2 = 'a2222222-2222-4222-8222-222222222222'
const T3 = 'a3333333-3333-4333-8333-333333333333'
// updated_at of every row below, and the cover-address version it gives (base 36).
const UPDATED_AT = '2026-10-20T10:00:00Z'
const V = Date.parse(UPDATED_AT).toString(36)

/** A private playlist row without a custom cover. */
function playlistRow(overrides: Partial<PlaylistRow> = {}): PlaylistRow {
  return {
    id: PLAYLIST, user_id: USER, purpose: 'playlist', title: 'Night drive', description: null, visibility: 'private', cover_path: null,
    created_at: UPDATED_AT, updated_at: UPDATED_AT,
    ...overrides,
  }
}

/** A private 60 s track with a cover. */
function trackRow(id: string, overrides: Partial<TrackSummaryRow> = {}): TrackSummaryRow {
  return {
    id, title: `Track ${id.slice(0, 2)}`, composers: null, album: null, year: null, genre_id: null, subgenre_id: null, mastered: false,
    visibility: 'private', duration_seconds: 60, has_lyrics: false, has_synced_lyrics: false,
    cover_path: `${USER}/${id}.webp`, created_at: UPDATED_AT, updated_at: UPDATED_AT,
    ...overrides,
  }
}

/** A playlist row with its tracks, stored out of order (like the database may return them). */
function detailRow(tracks: TrackSummaryRow[], overrides: Partial<PlaylistRow> = {}) {
  return {
    ...playlistRow(overrides),
    playlist_tracks: tracks.map((t, position) => ({ position, tracks: t })).reverse(),
  }
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('getPlaylist', () => {
  it('returns the tracks in order, with cover addresses, the mosaic and the private count', async () => {
    vi.mocked(playlistsRepo.findPlaylistRow).mockResolvedValue(detailRow([
      trackRow(T1, { duration_seconds: 100 }),
      trackRow(T2, { visibility: 'unlisted', cover_path: null, duration_seconds: 20.5 }),
      trackRow(T3),
    ]))

    // The playlist as the page gets it.
    const playlist = await getPlaylist(db, USER, PLAYLIST)

    expect(playlist.tracks.map(t => t.id)).toEqual([T1, T2, T3])
    expect(playlist.tracks[0]!.coverUrl).toBe(`/api/covers/tracks/${T1}?v=${V}`)
    // T2 has no cover: the mosaic skips it.
    expect(playlist.mosaic).toEqual([`/api/covers/tracks/${T1}?v=${V}`, `/api/covers/tracks/${T3}?v=${V}`])
    expect(playlist.trackCount).toBe(3)
    expect(playlist.durationSeconds).toBe(180.5)
    expect(playlist.privateTrackCount).toBe(2)
    expect(playlist.coverUrl).toBeNull()
  })

  it('answers 404 for a missing playlist (or someone else\'s)', async () => {
    vi.mocked(playlistsRepo.findPlaylistRow).mockResolvedValue(null)
    await expect(getPlaylist(db, USER, PLAYLIST)).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('listPlaylists', () => {
  it('gives the custom cover and the mosaic stable app addresses', async () => {
    vi.mocked(playlistsRepo.listPlaylistRows).mockResolvedValue([
      { ...playlistRow({ cover_path: `${USER}/playlists/${PLAYLIST}.webp` }), playlist_tracks: [{ position: 0, tracks: trackRow(T1) }] },
    ])

    // The only playlist of the list.
    const [summary] = await listPlaylists(db, USER, 'playlist')

    expect(summary!.coverUrl).toBe(`/api/covers/playlists/${PLAYLIST}?v=${V}`)
    expect(summary!.mosaic).toEqual([`/api/covers/tracks/${T1}?v=${V}`])
  })

  it('lists one purpose only, and says which', async () => {
    vi.mocked(playlistsRepo.listPlaylistRows).mockResolvedValue([
      { ...playlistRow({ purpose: 'versions', visibility: 'unlisted' }), playlist_tracks: [{ position: 0, tracks: trackRow(T1) }] },
    ])

    // The only group of the list.
    const [group] = await listPlaylists(db, USER, 'versions')

    // The purpose filter is the repository's query (one indexed column).
    expect(playlistsRepo.listPlaylistRows).toHaveBeenCalledWith(db, USER, 'versions')
    expect(group!.purpose).toBe('versions')
  })
})

describe('createPlaylist', () => {
  it('creates the playlist with its first tracks', async () => {
    vi.mocked(playlistsRepo.insertPlaylistRow).mockResolvedValue(playlistRow())
    vi.mocked(playlistsRepo.findPlaylistRow).mockResolvedValue(detailRow([trackRow(T1)]))

    // The new playlist, read back with its track.
    const playlist = await createPlaylist(db, USER, { title: 'Night drive', trackIds: [T1] })

    expect(playlistsRepo.insertPlaylistRow).toHaveBeenCalledWith(db, expect.objectContaining({
      user_id: USER, purpose: 'playlist', title: 'Night drive', visibility: 'private',
    }))
    expect(playlistsRepo.setPlaylistTrackIds).toHaveBeenCalledWith(db, PLAYLIST, [T1])
    expect(playlist.trackCount).toBe(1)
  })

  it('creates a group of versions when asked ("Share for feedback")', async () => {
    vi.mocked(playlistsRepo.insertPlaylistRow).mockResolvedValue(playlistRow({ purpose: 'versions', visibility: 'unlisted' }))
    vi.mocked(playlistsRepo.findPlaylistRow).mockResolvedValue(detailRow([trackRow(T1), trackRow(T2)], { purpose: 'versions', visibility: 'unlisted' }))

    // The new group, read back with its two versions.
    const group = await createPlaylist(db, USER, { title: 'Night drive – versions', purpose: 'versions', visibility: 'unlisted', trackIds: [T1, T2] })

    expect(playlistsRepo.insertPlaylistRow).toHaveBeenCalledWith(db, expect.objectContaining({
      purpose: 'versions', visibility: 'unlisted',
    }))
    expect(group.purpose).toBe('versions')
  })

  it('deletes the new playlist again when its tracks are refused, and answers with that error', async () => {
    vi.mocked(playlistsRepo.insertPlaylistRow).mockResolvedValue(playlistRow())
    // A track that is not the user's: the database function's "not found", as toHttpError maps it.
    const refused = Object.assign(new Error('Item not found'), { statusCode: 404 })
    vi.mocked(playlistsRepo.setPlaylistTrackIds).mockRejectedValue(refused)

    await expect(createPlaylist(db, USER, { title: 'Night drive', trackIds: [T1] })).rejects.toBe(refused)
    // Before: the empty playlist stayed, and every retry made one more.
    expect(playlistsRepo.deletePlaylistRow).toHaveBeenCalledWith(db, USER, PLAYLIST)
  })

  it('still answers with the tracks\' error when deleting the new playlist fails too', async () => {
    vi.mocked(playlistsRepo.insertPlaylistRow).mockResolvedValue(playlistRow())
    // The first failure, and the one of the clean-up after it (only logged).
    const refused = Object.assign(new Error('Item not found'), { statusCode: 404 })
    vi.mocked(playlistsRepo.setPlaylistTrackIds).mockRejectedValue(refused)
    vi.mocked(playlistsRepo.deletePlaylistRow).mockRejectedValue(new Error('database down'))
    // The log line, kept out of the test output.
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(createPlaylist(db, USER, { title: 'Night drive', trackIds: [T1] })).rejects.toBe(refused)
    expect(log).toHaveBeenCalledTimes(1)
  })

  it('touches nothing else for a playlist created without tracks', async () => {
    vi.mocked(playlistsRepo.insertPlaylistRow).mockResolvedValue(playlistRow())
    vi.mocked(playlistsRepo.findPlaylistRow).mockResolvedValue(detailRow([]))

    await createPlaylist(db, USER, { title: 'Empty for now' })
    expect(playlistsRepo.setPlaylistTrackIds).not.toHaveBeenCalled()
    expect(playlistsRepo.deletePlaylistRow).not.toHaveBeenCalled()
  })
})

describe('updatePlaylist', () => {
  it('rejects a cover outside the playlist\'s path', async () => {
    await expect(updatePlaylist(db, USER, PLAYLIST, { coverPath: `${USER}/${T1}.webp` }))
      .rejects.toMatchObject({ statusCode: 400 })
    expect(playlistsRepo.updatePlaylistRow).not.toHaveBeenCalled()
  })

  it('deletes the old cover file when the cover is removed', async () => {
    // The custom cover the playlist had before removal.
    const cover = `${USER}/playlists/${PLAYLIST}.webp`
    vi.mocked(playlistsRepo.findPlaylistRow).mockResolvedValue(detailRow([], { cover_path: cover }))
    vi.mocked(playlistsRepo.updatePlaylistRow).mockResolvedValue(playlistRow())

    await updatePlaylist(db, USER, PLAYLIST, { coverPath: null })

    expect(playlistsRepo.updatePlaylistRow).toHaveBeenCalledWith(db, USER, PLAYLIST, { cover_path: null })
    expect(storageRepo.removeObjects).toHaveBeenCalledWith(db, 'covers', [cover])
  })
})

describe('deletePlaylist', () => {
  it('removes the custom cover too', async () => {
    vi.mocked(playlistsRepo.deletePlaylistRow).mockResolvedValue({ cover_path: `${USER}/playlists/${PLAYLIST}.webp` })
    await deletePlaylist(db, USER, PLAYLIST)
    expect(storageRepo.removeObjects).toHaveBeenCalledWith(db, 'covers', [`${USER}/playlists/${PLAYLIST}.webp`])
  })

  it('answers 404 for a missing playlist', async () => {
    vi.mocked(playlistsRepo.deletePlaylistRow).mockResolvedValue(null)
    await expect(deletePlaylist(db, USER, PLAYLIST)).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('playlist tracks', () => {
  beforeEach(() => {
    vi.mocked(playlistsRepo.findPlaylistRow).mockResolvedValue(detailRow([]))
  })

  it('appends only the tracks that are not in the playlist yet, in one step (never rewriting the list)', async () => {
    vi.mocked(playlistsRepo.findPlaylistTrackIds).mockResolvedValue([T1, T2])

    await addPlaylistTracks(db, USER, PLAYLIST, [T2, T3])

    expect(playlistsRepo.appendPlaylistTrackIds).toHaveBeenCalledWith(db, PLAYLIST, [T3])
    expect(playlistsRepo.setPlaylistTrackIds).not.toHaveBeenCalled()
  })

  it('refuses an append past the limit with a readable 400, before the database is asked', async () => {
    // A playlist one track short of the limit, and two new tracks for it.
    const full = Array.from({ length: MAX_PLAYLIST_TRACKS - 1 }, (_, i) => `t${i}`)
    vi.mocked(playlistsRepo.findPlaylistTrackIds).mockResolvedValue(full)

    await expect(addPlaylistTracks(db, USER, PLAYLIST, [T1, T2]))
      .rejects.toMatchObject({ statusCode: 400, message: `A playlist holds at most ${MAX_PLAYLIST_TRACKS} tracks` })
    expect(playlistsRepo.appendPlaylistTrackIds).not.toHaveBeenCalled()
  })

  it('takes tracks up to the limit exactly, the ones already there not counted twice', async () => {
    // One place left, and a track already in the list given along with a new one.
    const almost = [...Array.from({ length: MAX_PLAYLIST_TRACKS - 2 }, (_, i) => `t${i}`), T1]
    vi.mocked(playlistsRepo.findPlaylistTrackIds).mockResolvedValue(almost)

    await addPlaylistTracks(db, USER, PLAYLIST, [T1, T2])
    expect(playlistsRepo.appendPlaylistTrackIds).toHaveBeenCalledWith(db, PLAYLIST, [T2])
  })

  it('does not write anything when every track is already there', async () => {
    vi.mocked(playlistsRepo.findPlaylistTrackIds).mockResolvedValue([T1])
    await addPlaylistTracks(db, USER, PLAYLIST, [T1])
    expect(playlistsRepo.appendPlaylistTrackIds).not.toHaveBeenCalled()
  })

  it('replaces the whole list when reordering', async () => {
    vi.mocked(playlistsRepo.findPlaylistTrackIds).mockResolvedValue([T1, T2])
    await setPlaylistTracks(db, USER, PLAYLIST, [T2, T1])
    expect(playlistsRepo.setPlaylistTrackIds).toHaveBeenCalledWith(db, PLAYLIST, [T2, T1])
  })

  it('answers 404 for someone else\'s playlist', async () => {
    vi.mocked(playlistsRepo.findPlaylistTrackIds).mockResolvedValue(null)
    await expect(addPlaylistTracks(db, USER, PLAYLIST, [T1])).rejects.toMatchObject({ statusCode: 404 })
    await expect(setPlaylistTracks(db, USER, PLAYLIST, [T1])).rejects.toMatchObject({ statusCode: 404 })
    expect(playlistsRepo.setPlaylistTrackIds).not.toHaveBeenCalled()
    expect(playlistsRepo.appendPlaylistTrackIds).not.toHaveBeenCalled()
  })
})
