/**
 * Tracks service with mocked repositories and a fake audio storage: upload targets, registration
 * checks (paths, stored size, clean-up on failure), repeated registrations (the same request
 * answered with the track, a registered track's file never deleted nor overwritten), updates,
 * deletion and playback URLs.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TrackRow } from '~~/server/mappers/track'
import type { DbClient } from '~~/server/utils/auth'
import type { AudioStorage } from '~~/server/repositories/audio-storage'
import * as tracksRepo from '~~/server/repositories/tracks.repository'
import * as storageRepo from '~~/server/repositories/storage.repository'
import {
  UPLOAD_URL_TTL,
  createTrack,
  createUploadTarget,
  deleteTrack,
  getPlaybackSource,
  listTracks,
  updateTrack,
} from '~~/server/services/tracks.service'

vi.mock('~~/server/repositories/tracks.repository')
vi.mock('~~/server/repositories/storage.repository', async (importOriginal) => {
  // The real module, for its SIGNED_URL_TTL.
  const original = await importOriginal<typeof storageRepo>()
  return {
    SIGNED_URL_TTL: original.SIGNED_URL_TTL,
    removeObjects: vi.fn(),
  }
})

// The repositories are mocked: the client is never used.
const db = {} as DbClient
// Fixed ids and the storage paths they lead to (the format checks only care about the shape).
const USER = '11111111-1111-4111-8111-111111111111'
const TRACK = '22222222-2222-4222-8222-222222222222'
const AUDIO = `${USER}/${TRACK}.flac`
const COVER = `${USER}/${TRACK}.webp`

/** Audio storage double (Cloudflare R2 in production). */
function fakeAudioStorage() {
  return {
    presign: vi.fn(async (method: string, key: string) => `https://r2.test/${key}?method=${method}`),
    streamUrl: vi.fn(async (key: string) => `/api/stream?k=${key}`),
    head: vi.fn(async () => ({ size: 10, contentType: 'audio/flac' }) as { size: number, contentType: string | null } | null),
    remove: vi.fn(async () => {}),
  }
}

/** A fresh fake audio storage for every test. */
let audio: ReturnType<typeof fakeAudioStorage>
/** The fake, typed as the real client for the service functions. */
const storage = () => audio as unknown as AudioStorage

/** A complete track row (private, FLAC, 60 s). */
function makeRow(overrides: Partial<TrackRow> = {}): TrackRow {
  return {
    id: TRACK, user_id: USER, title: 'Track', composers: null, genre_id: null, year: null, album: null,
    description: null, suno_prompt: null, mastered: false, visibility: 'private', lyrics: null,
    lyrics_synced: null, has_lyrics: false, has_synced_lyrics: false, audio_path: AUDIO, cover_path: null,
    mime_type: 'audio/flac', size_bytes: 10, duration_seconds: 60, peaks: null,
    created_at: '2026-10-18T10:00:00Z', updated_at: '2026-10-18T10:00:00Z',
    ...overrides,
  }
}

/** A valid POST /api/tracks body for TRACK. */
const createInput = {
  id: TRACK,
  title: 'Track',
  audioPath: AUDIO,
  mimeType: 'audio/flac',
  sizeBytes: 10,
}

beforeEach(() => {
  vi.resetAllMocks()
  audio = fakeAudioStorage()
})

describe('listTracks', () => {
  it('gives covers stable, versioned app addresses without signing anything', async () => {
    vi.mocked(tracksRepo.listTrackRows).mockResolvedValue([
      makeRow({ cover_path: COVER }),
      makeRow({ id: 'other', cover_path: null }),
    ])

    // The library as the service returns it.
    const result = await listTracks(db, USER)

    // The version is updated_at in base 36: a new cover (new updated_at) means a new address.
    const version = Date.parse('2026-10-18T10:00:00Z').toString(36)
    expect(result.map(t => t.coverUrl)).toEqual([`/api/covers/tracks/${TRACK}?v=${version}`, null])
  })
})

describe('createUploadTarget', () => {
  it('signs an upload URL inside the user folder', async () => {
    // Before the call: the expiry must be at least an hour after this.
    const before = Date.now()
    const target = await createUploadTarget(db, storage(), USER, {
      trackId: TRACK, extension: 'flac', mimeType: 'audio/flac', sizeBytes: 10,
    })

    expect(target.audioPath).toBe(AUDIO)
    expect(audio.presign).toHaveBeenCalledWith('PUT', AUDIO, UPLOAD_URL_TTL)
    expect(target.uploadUrl).toBe(`https://r2.test/${AUDIO}?method=PUT`)
    expect(new Date(target.expiresAt).getTime()).toBeGreaterThanOrEqual(before + UPLOAD_URL_TTL * 1000)
  })

  it('gives no upload address for a track already registered: its file is never overwritten', async () => {
    vi.mocked(tracksRepo.findTrackAudioPath).mockResolvedValue(AUDIO)

    await expect(createUploadTarget(db, storage(), USER, {
      trackId: TRACK, extension: 'flac', mimeType: 'audio/flac', sizeBytes: 10,
    })).rejects.toMatchObject({ statusCode: 409 })
    expect(audio.presign).not.toHaveBeenCalled()
  })
})

describe('createTrack', () => {
  it('rejects an audio file outside the user folder', async () => {
    await expect(createTrack(db, storage(), USER, { ...createInput, audioPath: `other/${TRACK}.flac` }))
      .rejects.toMatchObject({ statusCode: 400 })
    expect(tracksRepo.insertTrackRow).not.toHaveBeenCalled()
  })

  it('rejects a cover that does not belong to the track', async () => {
    await expect(createTrack(db, storage(), USER, { ...createInput, coverPath: `${USER}/other.webp` }))
      .rejects.toMatchObject({ statusCode: 400 })
  })

  it('rejects when the file was never uploaded', async () => {
    audio.head.mockResolvedValue(null)
    await expect(createTrack(db, storage(), USER, createInput)).rejects.toMatchObject({ statusCode: 400 })
    expect(tracksRepo.insertTrackRow).not.toHaveBeenCalled()
  })

  it('rejects and deletes an uploaded file that differs from the declared one', async () => {
    audio.head.mockResolvedValue({ size: 999_999, contentType: 'audio/flac' })

    await expect(createTrack(db, storage(), USER, createInput)).rejects.toMatchObject({ statusCode: 400 })

    expect(audio.remove).toHaveBeenCalledWith([AUDIO])
    expect(tracksRepo.insertTrackRow).not.toHaveBeenCalled()
  })

  it('registers the track when the uploaded file matches', async () => {
    vi.mocked(tracksRepo.insertTrackRow).mockResolvedValue(makeRow())

    // The registered track.
    const track = await createTrack(db, storage(), USER, createInput)

    expect(audio.head).toHaveBeenCalledWith(AUDIO)
    expect(tracksRepo.insertTrackRow).toHaveBeenCalledWith(db, expect.objectContaining({ id: TRACK, user_id: USER }))
    expect(track.id).toBe(TRACK)
    expect(audio.remove).not.toHaveBeenCalled()
  })

  it('deletes the uploaded audio when the track cannot be registered', async () => {
    vi.mocked(tracksRepo.insertTrackRow).mockRejectedValue(new Error('database down'))

    await expect(createTrack(db, storage(), USER, createInput)).rejects.toThrow('database down')

    expect(audio.remove).toHaveBeenCalledWith([AUDIO])
  })

  it('answers a repeated registration with the track already there, touching nothing', async () => {
    vi.mocked(tracksRepo.findTrackRow).mockResolvedValue(makeRow())

    // The answer to the repeated request.
    const track = await createTrack(db, storage(), USER, createInput)

    expect(track.id).toBe(TRACK)
    expect(audio.head).not.toHaveBeenCalled()
    expect(tracksRepo.insertTrackRow).not.toHaveBeenCalled()
    expect(audio.remove).not.toHaveBeenCalled()
  })

  it('refuses an id already registered with another file (409), touching nothing', async () => {
    vi.mocked(tracksRepo.findTrackRow).mockResolvedValue(makeRow({ audio_path: `${USER}/${TRACK}.mp3` }))

    await expect(createTrack(db, storage(), USER, createInput)).rejects.toMatchObject({ statusCode: 409 })
    expect(audio.head).not.toHaveBeenCalled()
    expect(audio.remove).not.toHaveBeenCalled()
  })

  it('keeps the file when an identical request running alongside registered the track first', async () => {
    // The unique violation, as toHttpError maps it.
    vi.mocked(tracksRepo.insertTrackRow).mockRejectedValue(Object.assign(new Error('Item already exists'), { statusCode: 409 }))

    await expect(createTrack(db, storage(), USER, createInput)).rejects.toMatchObject({ statusCode: 409 })
    expect(audio.remove).not.toHaveBeenCalled()
  })
})

describe('updateTrack', () => {
  it('responds 404 when the track does not exist (or is not the user\'s)', async () => {
    vi.mocked(tracksRepo.updateTrackRow).mockResolvedValue(null)
    await expect(updateTrack(db, USER, TRACK, { title: 'x' })).rejects.toMatchObject({ statusCode: 404 })
  })

  it('deletes the cover file when the cover is removed', async () => {
    vi.mocked(tracksRepo.findTrackRow).mockResolvedValue(makeRow({ cover_path: COVER }))
    vi.mocked(tracksRepo.updateTrackRow).mockResolvedValue(makeRow())

    await updateTrack(db, USER, TRACK, { coverPath: null })

    expect(tracksRepo.updateTrackRow).toHaveBeenCalledWith(db, USER, TRACK, { cover_path: null })
    expect(storageRepo.removeObjects).toHaveBeenCalledWith(db, 'covers', [COVER])
  })

  it('does not touch storage for metadata-only changes', async () => {
    vi.mocked(tracksRepo.updateTrackRow).mockResolvedValue(makeRow({ mastered: true }))
    // The track after a metadata-only change.
    const track = await updateTrack(db, USER, TRACK, { mastered: true })
    expect(track.mastered).toBe(true)
    expect(tracksRepo.findTrackRow).not.toHaveBeenCalled()
    expect(storageRepo.removeObjects).not.toHaveBeenCalled()
  })
})

describe('deleteTrack', () => {
  it('deletes the track, then its audio (R2) and its cover (Supabase)', async () => {
    vi.mocked(tracksRepo.deleteTrackRow).mockResolvedValue({ audio_path: AUDIO, cover_path: COVER })

    await deleteTrack(db, storage(), USER, TRACK)

    expect(audio.remove).toHaveBeenCalledWith([AUDIO])
    expect(storageRepo.removeObjects).toHaveBeenCalledWith(db, 'covers', [COVER])
  })

  it('responds 404 when the track does not exist', async () => {
    vi.mocked(tracksRepo.deleteTrackRow).mockResolvedValue(null)
    await expect(deleteTrack(db, storage(), USER, TRACK)).rejects.toMatchObject({ statusCode: 404 })
    expect(audio.remove).not.toHaveBeenCalled()
  })
})

describe('getPlaybackSource', () => {
  it('returns the streaming address with its expiry', async () => {
    vi.mocked(tracksRepo.findTrackAudioPath).mockResolvedValue(AUDIO)
    // Before the call: the expiry must be six hours after this, or later.
    const before = Date.now()

    // The track's streaming address.
    const source = await getPlaybackSource(db, storage(), USER, TRACK)

    expect(audio.streamUrl).toHaveBeenCalledWith(AUDIO, storageRepo.SIGNED_URL_TTL)
    expect(source.url).toBe(`/api/stream?k=${AUDIO}`)
    expect(new Date(source.expiresAt).getTime()).toBeGreaterThanOrEqual(before + storageRepo.SIGNED_URL_TTL * 1000)
  })

  it('responds 404 for missing tracks', async () => {
    vi.mocked(tracksRepo.findTrackAudioPath).mockResolvedValue(null)
    await expect(getPlaybackSource(db, storage(), USER, TRACK)).rejects.toMatchObject({ statusCode: 404 })
  })
})
