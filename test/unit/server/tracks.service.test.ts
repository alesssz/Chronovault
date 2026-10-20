import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TrackRow } from '~~/server/mappers/track'
import type { DbClient } from '~~/server/utils/auth'
import * as tracksRepo from '~~/server/repositories/tracks.repository'
import * as storageRepo from '~~/server/repositories/storage.repository'
import { createTrack, deleteTrack, getPlaybackSource, listTracks, updateTrack } from '~~/server/services/tracks.service'

vi.mock('~~/server/repositories/tracks.repository')
vi.mock('~~/server/repositories/storage.repository', async (importOriginal) => {
  const original = await importOriginal<typeof storageRepo>()
  return {
    SIGNED_URL_TTL: original.SIGNED_URL_TTL,
    objectExists: vi.fn(),
    createSignedUrl: vi.fn(),
    createSignedUrls: vi.fn(),
    removeObjects: vi.fn(),
  }
})

const db = {} as DbClient
const USER = '11111111-1111-4111-8111-111111111111'
const TRACK = '22222222-2222-4222-8222-222222222222'
const AUDIO = `${USER}/${TRACK}.mp3`
const COVER = `${USER}/${TRACK}.webp`

function makeRow(overrides: Partial<TrackRow> = {}): TrackRow {
  return {
    id: TRACK, user_id: USER, title: 'Track', composers: null, genre_id: null, year: null, album: null,
    description: null, suno_prompt: null, mastered: false, visibility: 'private', lyrics: null,
    lyrics_synced: null, has_lyrics: false, has_synced_lyrics: false, audio_path: AUDIO, cover_path: null,
    mime_type: 'audio/mpeg', size_bytes: 10, duration_seconds: 60, peaks: null,
    created_at: '2026-10-18T10:00:00Z', updated_at: '2026-10-18T10:00:00Z',
    ...overrides,
  }
}

const createInput = {
  id: TRACK,
  title: 'Track',
  audioPath: AUDIO,
  mimeType: 'audio/mpeg',
  sizeBytes: 10,
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(storageRepo.createSignedUrl).mockResolvedValue('https://signed/url')
  vi.mocked(storageRepo.createSignedUrls).mockResolvedValue(new Map())
})

describe('listTracks', () => {
  it('signs covers in bulk and attaches them to the tracks', async () => {
    vi.mocked(tracksRepo.listTrackRows).mockResolvedValue([
      makeRow({ cover_path: COVER }),
      makeRow({ id: 'other', cover_path: null }),
    ])
    vi.mocked(storageRepo.createSignedUrls).mockResolvedValue(new Map([[COVER, 'https://signed/cover']]))

    const result = await listTracks(db, USER)

    expect(storageRepo.createSignedUrls).toHaveBeenCalledWith(db, 'covers', [COVER])
    expect(result.map(t => t.coverUrl)).toEqual(['https://signed/cover', null])
  })
})

describe('createTrack', () => {
  it('rejects an audio file outside the user folder', async () => {
    await expect(createTrack(db, USER, { ...createInput, audioPath: `other/${TRACK}.mp3` }))
      .rejects.toMatchObject({ statusCode: 400 })
    expect(tracksRepo.insertTrackRow).not.toHaveBeenCalled()
  })

  it('rejects a cover that does not belong to the track', async () => {
    await expect(createTrack(db, USER, { ...createInput, coverPath: `${USER}/other.webp` }))
      .rejects.toMatchObject({ statusCode: 400 })
  })

  it('rejects when the file was never uploaded to storage', async () => {
    vi.mocked(storageRepo.objectExists).mockResolvedValue(false)
    await expect(createTrack(db, USER, createInput)).rejects.toMatchObject({ statusCode: 400 })
    expect(tracksRepo.insertTrackRow).not.toHaveBeenCalled()
  })

  it('registers the track when the file exists', async () => {
    vi.mocked(storageRepo.objectExists).mockResolvedValue(true)
    vi.mocked(tracksRepo.insertTrackRow).mockResolvedValue(makeRow())

    const track = await createTrack(db, USER, createInput)

    expect(storageRepo.objectExists).toHaveBeenCalledWith(db, 'audio', AUDIO)
    expect(tracksRepo.insertTrackRow).toHaveBeenCalledWith(db, expect.objectContaining({ id: TRACK, user_id: USER }))
    expect(track.id).toBe(TRACK)
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
    const track = await updateTrack(db, USER, TRACK, { mastered: true })
    expect(track.mastered).toBe(true)
    expect(tracksRepo.findTrackRow).not.toHaveBeenCalled()
    expect(storageRepo.removeObjects).not.toHaveBeenCalled()
  })
})

describe('deleteTrack', () => {
  it('deletes the track, then its audio and cover from storage', async () => {
    vi.mocked(tracksRepo.deleteTrackRow).mockResolvedValue({ audio_path: AUDIO, cover_path: COVER })

    await deleteTrack(db, USER, TRACK)

    expect(storageRepo.removeObjects).toHaveBeenCalledWith(db, 'audio', [AUDIO])
    expect(storageRepo.removeObjects).toHaveBeenCalledWith(db, 'covers', [COVER])
  })

  it('responds 404 when the track does not exist', async () => {
    vi.mocked(tracksRepo.deleteTrackRow).mockResolvedValue(null)
    await expect(deleteTrack(db, USER, TRACK)).rejects.toMatchObject({ statusCode: 404 })
    expect(storageRepo.removeObjects).not.toHaveBeenCalled()
  })
})

describe('getPlaybackSource', () => {
  it('returns a signed URL with its expiry', async () => {
    vi.mocked(tracksRepo.findTrackAudioPath).mockResolvedValue(AUDIO)
    const before = Date.now()

    const source = await getPlaybackSource(db, USER, TRACK)

    expect(storageRepo.createSignedUrl).toHaveBeenCalledWith(db, 'audio', AUDIO)
    expect(source.url).toBe('https://signed/url')
    expect(new Date(source.expiresAt).getTime()).toBeGreaterThanOrEqual(before + storageRepo.SIGNED_URL_TTL * 1000)
  })

  it('responds 404 for missing tracks', async () => {
    vi.mocked(tracksRepo.findTrackAudioPath).mockResolvedValue(null)
    await expect(getPlaybackSource(db, USER, TRACK)).rejects.toMatchObject({ statusCode: 404 })
  })
})
