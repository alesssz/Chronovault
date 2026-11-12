/**
 * Tracks service with mocked repositories and a fake audio storage: upload targets, registration
 * checks (paths, the audio's extension as the database accepts it, the cover's exact WebP path, stored size, the audio deleted when the database
 * refuses the track but kept when the outcome is unknown), repeated registrations (the same request
 * answered with the track, a registered track's file never deleted nor overwritten), updates,
 * deletion and playback URLs. Replacing a track's audio: the upload address next to the old file,
 * then the swap (paths, the stored file, a replace from another tab winning, the new or the old file
 * deleted as each outcome needs, the "check the sync" flag only with synced lyrics).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TrackRow } from '~~/server/mappers/track'
import type { DbClient } from '~~/server/utils/auth'
import type { AudioStorage } from '~~/server/repositories/audio-storage'
import * as tracksRepo from '~~/server/repositories/tracks.repository'
import * as storageRepo from '~~/server/repositories/storage.repository'
import {
  UPLOAD_URL_TTL,
  createReplaceTarget,
  createTrack,
  createUploadTarget,
  deleteTrack,
  getPlaybackSource,
  listTrackMetadata,
  listTracks,
  replaceTrackAudio,
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
    id: TRACK, user_id: USER, title: 'Track', composers: null, genre_id: null, subgenre_id: null, year: null, album: null,
    description: null, suno_prompt: null, mastered: false, visibility: 'private', lyrics: null,
    lyrics_synced: null, has_lyrics: false, has_synced_lyrics: false, sync_needs_review: false, audio_path: AUDIO, cover_path: null,
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

describe('listTrackMetadata', () => {
  it('gives every metadata field of every track, long texts included', async () => {
    vi.mocked(tracksRepo.listTrackMetadataRows).mockResolvedValue([
      makeRow({ status: 'draft', composers: 'Ada', genre_id: 'g1', subgenre_id: 's1', description: 'About', suno_prompt: 'rock', lyrics: 'One', has_synced_lyrics: true }),
    ])

    expect(await listTrackMetadata(db, USER)).toEqual([{
      id: TRACK,
      title: 'Track',
      composers: 'Ada',
      album: null,
      year: null,
      genreId: 'g1',
      subgenreId: 's1',
      mastered: false,
      status: 'draft',
      visibility: 'private',
      description: 'About',
      sunoPrompt: 'rock',
      lyrics: 'One',
      hasSyncedLyrics: true,
    }])
    expect(tracksRepo.listTrackMetadataRows).toHaveBeenCalledWith(db, USER)
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
    // Signed for this file only: its declared size and type.
    expect(audio.presign).toHaveBeenCalledWith('PUT', AUDIO, UPLOAD_URL_TTL, { size: 10, contentType: 'audio/flac' })
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

  it('rejects an audio path whose extension the database would refuse, before touching storage', async () => {
    // A control character in the extension: before, it passed here and the storage client threw (500).
    await expect(createTrack(db, storage(), USER, { ...createInput, audioPath: `${USER}/${TRACK}.mp\u00013` }))
      .rejects.toMatchObject({ statusCode: 400 })
    expect(audio.head).not.toHaveBeenCalled()
  })

  it('rejects a cover that does not belong to the track', async () => {
    await expect(createTrack(db, storage(), USER, { ...createInput, coverPath: `${USER}/other.webp` }))
      .rejects.toMatchObject({ statusCode: 400 })
  })

  it('rejects the track\'s own cover name with another extension, before touching storage', async () => {
    // Before: any extension passed, the insert failed on the database's .webp rule, and the audio was deleted.
    await expect(createTrack(db, storage(), USER, { ...createInput, coverPath: `${USER}/${TRACK}.jpg` }))
      .rejects.toMatchObject({ statusCode: 400 })
    expect(tracksRepo.insertTrackRow).not.toHaveBeenCalled()
    expect(audio.remove).not.toHaveBeenCalled()
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

  it('deletes the uploaded audio when the database refuses the track', async () => {
    // A check violation, as toHttpError maps it: the row was not written.
    vi.mocked(tracksRepo.insertTrackRow).mockRejectedValue(Object.assign(new Error('Invalid data'), { statusCode: 400 }))

    await expect(createTrack(db, storage(), USER, createInput)).rejects.toMatchObject({ statusCode: 400 })

    expect(audio.remove).toHaveBeenCalledWith([AUDIO])
  })

  it('keeps the uploaded audio when the insert\'s outcome is unknown (the row may be there)', async () => {
    // A 500 from toHttpError, and an error that never went through it (a dropped connection).
    for (const failure of [Object.assign(new Error('Internal error'), { statusCode: 500 }), new Error('fetch failed')]) {
      vi.mocked(tracksRepo.insertTrackRow).mockRejectedValueOnce(failure)
      await expect(createTrack(db, storage(), USER, createInput)).rejects.toBe(failure)
    }
    // Before: deleted either way, leaving a committed track without its audio.
    expect(audio.remove).not.toHaveBeenCalled()
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

describe('createReplaceTarget', () => {
  it('signs an upload URL for a new key next to the track\'s file: <trackId>.<revision>.<ext>', async () => {
    vi.mocked(tracksRepo.findTrackAudioPath).mockResolvedValue(AUDIO)

    // The address for the new file.
    const target = await createReplaceTarget(db, storage(), USER, TRACK, { extension: 'mp3', mimeType: 'audio/mpeg', sizeBytes: 10 })

    expect(target.audioPath).toMatch(new RegExp(`^${USER}/${TRACK}\\.[0-9a-f]{8}\\.mp3$`))
    // Never the current file: the track keeps playing it until the swap.
    expect(target.audioPath).not.toBe(AUDIO)
    expect(audio.presign).toHaveBeenCalledWith('PUT', target.audioPath, UPLOAD_URL_TTL, { size: 10, contentType: 'audio/mpeg' })
  })

  it('gives no address for a track that is not the user\'s (404)', async () => {
    vi.mocked(tracksRepo.findTrackAudioPath).mockResolvedValue(null)
    await expect(createReplaceTarget(db, storage(), USER, TRACK, { extension: 'mp3', mimeType: 'audio/mpeg', sizeBytes: 10 }))
      .rejects.toMatchObject({ statusCode: 404 })
    expect(audio.presign).not.toHaveBeenCalled()
  })
})

describe('replaceTrackAudio', () => {
  /** The new file, as createReplaceTarget would have named it. */
  const NEW_AUDIO = `${USER}/${TRACK}.0a1b2c3d.mp3`
  /** A valid PUT /api/tracks/:id/audio body. */
  const replaceInput = { audioPath: NEW_AUDIO, mimeType: 'audio/mpeg', sizeBytes: 10, durationSeconds: 58.5, peaks: [0.5] }

  it('refuses a path that is not a replacement of this track, before touching anything', async () => {
    for (const audioPath of [AUDIO, `${USER}/other.0a1b2c3d.mp3`, `other/${TRACK}.0a1b2c3d.mp3`, `${USER}/${TRACK}.0A1B2C3D.mp3`]) {
      await expect(replaceTrackAudio(db, storage(), USER, TRACK, { ...replaceInput, audioPath }))
        .rejects.toMatchObject({ statusCode: 400 })
    }
    expect(tracksRepo.findTrackRow).not.toHaveBeenCalled()
    expect(audio.remove).not.toHaveBeenCalled()
  })

  it('responds 404 for a track that is not the user\'s, leaving the file alone', async () => {
    vi.mocked(tracksRepo.findTrackRow).mockResolvedValue(null)
    await expect(replaceTrackAudio(db, storage(), USER, TRACK, replaceInput)).rejects.toMatchObject({ statusCode: 404 })
    expect(audio.remove).not.toHaveBeenCalled()
  })

  it('refuses the file the track already names (sent twice), deleting nothing', async () => {
    vi.mocked(tracksRepo.findTrackRow).mockResolvedValue(makeRow({ audio_path: NEW_AUDIO }))
    await expect(replaceTrackAudio(db, storage(), USER, TRACK, replaceInput)).rejects.toMatchObject({ statusCode: 400 })
    expect(audio.remove).not.toHaveBeenCalled()
  })

  it('refuses a file that was never uploaded', async () => {
    vi.mocked(tracksRepo.findTrackRow).mockResolvedValue(makeRow())
    audio.head.mockResolvedValue(null)
    await expect(replaceTrackAudio(db, storage(), USER, TRACK, replaceInput)).rejects.toMatchObject({ statusCode: 400 })
    expect(tracksRepo.swapTrackAudioRow).not.toHaveBeenCalled()
  })

  it('deletes and refuses an uploaded file that differs from the declared one, the track untouched', async () => {
    vi.mocked(tracksRepo.findTrackRow).mockResolvedValue(makeRow())
    audio.head.mockResolvedValue({ size: 999, contentType: 'audio/mpeg' })

    await expect(replaceTrackAudio(db, storage(), USER, TRACK, replaceInput)).rejects.toMatchObject({ statusCode: 400 })

    expect(audio.remove).toHaveBeenCalledWith([NEW_AUDIO])
    expect(audio.remove).not.toHaveBeenCalledWith([AUDIO])
    expect(tracksRepo.swapTrackAudioRow).not.toHaveBeenCalled()
  })

  it('moves the track to the new file, then deletes the old one; nothing else changes', async () => {
    vi.mocked(tracksRepo.findTrackRow).mockResolvedValue(makeRow())
    vi.mocked(tracksRepo.swapTrackAudioRow).mockResolvedValue(makeRow({ audio_path: NEW_AUDIO, mime_type: 'audio/mpeg', duration_seconds: 58.5 }))

    // The track after the replace.
    const track = await replaceTrackAudio(db, storage(), USER, TRACK, replaceInput)

    // Only the file's own columns, and only while the track still names the file read first.
    expect(tracksRepo.swapTrackAudioRow).toHaveBeenCalledWith(db, USER, TRACK, AUDIO, {
      audio_path: NEW_AUDIO, mime_type: 'audio/mpeg', size_bytes: 10, duration_seconds: 58.5, peaks: [0.5],
    })
    expect(audio.remove).toHaveBeenCalledTimes(1)
    expect(audio.remove).toHaveBeenCalledWith([AUDIO])
    expect(track.audioPath).toBe(NEW_AUDIO)
    expect(track.durationSeconds).toBe(58.5)
  })

  it('flags synced lyrics for checking: they were timed against the old file', async () => {
    vi.mocked(tracksRepo.findTrackRow).mockResolvedValue(makeRow({ has_synced_lyrics: true }))
    vi.mocked(tracksRepo.swapTrackAudioRow).mockResolvedValue(makeRow({ audio_path: NEW_AUDIO, sync_needs_review: true }))

    // The track after the replace, its synced lyrics flagged.
    const track = await replaceTrackAudio(db, storage(), USER, TRACK, replaceInput)

    expect(tracksRepo.swapTrackAudioRow).toHaveBeenCalledWith(db, USER, TRACK, AUDIO, expect.objectContaining({ sync_needs_review: true }))
    expect(track.syncNeedsReview).toBe(true)
  })

  it('lets a replace from another tab win: 409, and this file deleted while theirs stays', async () => {
    vi.mocked(tracksRepo.findTrackRow).mockResolvedValue(makeRow())
    // The track no longer names the file read first: nothing updated.
    vi.mocked(tracksRepo.swapTrackAudioRow).mockResolvedValue(null)

    await expect(replaceTrackAudio(db, storage(), USER, TRACK, replaceInput)).rejects.toMatchObject({ statusCode: 409 })

    expect(audio.remove).toHaveBeenCalledTimes(1)
    expect(audio.remove).toHaveBeenCalledWith([NEW_AUDIO])
  })

  it('deletes the new file when the database refuses the update, keeping the old one', async () => {
    vi.mocked(tracksRepo.findTrackRow).mockResolvedValue(makeRow())
    vi.mocked(tracksRepo.swapTrackAudioRow).mockRejectedValue(Object.assign(new Error('Invalid data'), { statusCode: 400 }))

    await expect(replaceTrackAudio(db, storage(), USER, TRACK, replaceInput)).rejects.toMatchObject({ statusCode: 400 })

    expect(audio.remove).toHaveBeenCalledTimes(1)
    expect(audio.remove).toHaveBeenCalledWith([NEW_AUDIO])
  })

  it('keeps both files when the update\'s outcome is unknown (the row may name either)', async () => {
    vi.mocked(tracksRepo.findTrackRow).mockResolvedValue(makeRow())
    vi.mocked(tracksRepo.swapTrackAudioRow).mockRejectedValue(Object.assign(new Error('Internal error'), { statusCode: 500 }))

    await expect(replaceTrackAudio(db, storage(), USER, TRACK, replaceInput)).rejects.toMatchObject({ statusCode: 500 })

    expect(audio.remove).not.toHaveBeenCalled()
  })
})

describe('updateTrack', () => {
  it('rejects a cover that is not the track\'s exact WebP path', async () => {
    for (const coverPath of [`${USER}/${TRACK}.jpg`, `${USER}/other.webp`]) {
      await expect(updateTrack(db, USER, TRACK, { coverPath })).rejects.toMatchObject({ statusCode: 400 })
    }
    expect(tracksRepo.updateTrackRow).not.toHaveBeenCalled()
  })

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

  it('clears the subgenre when the genre changes without one', async () => {
    vi.mocked(tracksRepo.findTrackRow).mockResolvedValue(makeRow({ genre_id: 'metal', subgenre_id: 'thrash' }))
    vi.mocked(tracksRepo.updateTrackRow).mockResolvedValue(makeRow({ genre_id: 'rock' }))

    await updateTrack(db, USER, TRACK, { genreId: 'rock' })

    // The old genre's subgenre would leave the pair incoherent: the database would refuse it.
    expect(tracksRepo.updateTrackRow).toHaveBeenCalledWith(db, USER, TRACK, { genre_id: 'rock', subgenre_id: null })
  })

  it('keeps the subgenre when the same genre is sent again, or the subgenre is sent too', async () => {
    vi.mocked(tracksRepo.findTrackRow).mockResolvedValue(makeRow({ genre_id: 'metal', subgenre_id: 'thrash' }))
    vi.mocked(tracksRepo.updateTrackRow).mockResolvedValue(makeRow())

    await updateTrack(db, USER, TRACK, { genreId: 'metal', title: 'x' })
    expect(tracksRepo.updateTrackRow).toHaveBeenLastCalledWith(db, USER, TRACK, { genre_id: 'metal', title: 'x' })

    await updateTrack(db, USER, TRACK, { genreId: 'rock', subgenreId: 'grunge' })
    expect(tracksRepo.updateTrackRow).toHaveBeenLastCalledWith(db, USER, TRACK, { genre_id: 'rock', subgenre_id: 'grunge' })
    // Only the first call needed the current row.
    expect(tracksRepo.findTrackRow).toHaveBeenCalledTimes(1)
  })

  it('clears the "check the sync" flag when the synced lyrics are emptied: nothing is left to check', async () => {
    vi.mocked(tracksRepo.updateTrackRow).mockResolvedValue(makeRow())

    for (const lyricsSynced of [null, []]) {
      await updateTrack(db, USER, TRACK, { lyricsSynced })
      expect(tracksRepo.updateTrackRow).toHaveBeenLastCalledWith(db, USER, TRACK, { lyrics_synced: lyricsSynced, sync_needs_review: false })
    }
    // Synced lines sent, or the field left alone: the flag is the owner's to clear.
    await updateTrack(db, USER, TRACK, { lyricsSynced: [{ time: 1, text: 'la' }] })
    expect(tracksRepo.updateTrackRow).toHaveBeenLastCalledWith(db, USER, TRACK, { lyrics_synced: [{ time: 1, text: 'la' }] })
    await updateTrack(db, USER, TRACK, { syncNeedsReview: false })
    expect(tracksRepo.updateTrackRow).toHaveBeenLastCalledWith(db, USER, TRACK, { sync_needs_review: false })
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
