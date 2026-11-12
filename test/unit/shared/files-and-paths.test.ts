/**
 * Audio file type detection, storage extensions, fallback titles, plausible durations and storage
 * path rules (the audio path's extension exactly as the database accepts it).
 */
import { describe, expect, it } from 'vitest'
import { MAX_DURATION_SECONDS, plausibleDuration, resolveAudioMimeType, storageExtension, titleFromFileName } from '~~/shared/utils/audio-files'
import { buildAudioPath, buildCoverPath, buildPlaylistCoverPath, isAudioPath, isAudioRevisionPath, isSafeStorageKey, newAudioRevision } from '~~/shared/utils/storage-paths'
import { computePeaks } from '~~/shared/utils/peaks'

// Fixed ids and the storage paths they lead to (the format checks only care about the shape).
const USER = '11111111-1111-4111-8111-111111111111'
const TRACK = '22222222-2222-4222-8222-222222222222'

describe('resolveAudioMimeType', () => {
  it('uses the file type when it is audio', () => {
    expect(resolveAudioMimeType({ name: 'a.mp3', type: 'audio/mpeg' })).toBe('audio/mpeg')
  })

  it('derives the type from the extension when the browser leaves it empty (e.g. FLAC on Windows)', () => {
    expect(resolveAudioMimeType({ name: 'Track.FLAC', type: '' })).toBe('audio/flac')
  })

  it('rejects non-audio formats', () => {
    expect(resolveAudioMimeType({ name: 'photo.jpg', type: 'image/jpeg' })).toBeNull()
    expect(resolveAudioMimeType({ name: 'no-extension', type: '' })).toBeNull()
  })
})

describe('storageExtension', () => {
  it('keeps known extensions', () => {
    expect(storageExtension({ name: 'x.M4A', type: 'audio/mp4' })).toBe('m4a')
  })

  it('derives the extension from the MIME type', () => {
    expect(storageExtension({ name: 'recording', type: 'audio/ogg' })).toBe('ogg')
  })
})

describe('titleFromFileName', () => {
  it('drops the extension and replaces underscores', () => {
    expect(titleFromFileName('my__track_name.final.wav')).toBe('my track name.final')
  })

  it('falls back for empty names', () => {
    expect(titleFromFileName('___.mp3')).toBe('Untitled')
  })
})

describe('plausibleDuration', () => {
  it('keeps a real duration, 0 and the maximum included', () => {
    expect(plausibleDuration(183.4)).toBe(183.4)
    expect(plausibleDuration(0)).toBe(0)
    expect(plausibleDuration(MAX_DURATION_SECONDS)).toBe(MAX_DURATION_SECONDS)
  })

  it('leaves out a missing, negative, infinite or absurd one (a broken tag), rather than have the track refused', () => {
    for (const seconds of [null, undefined, -1, Number.NaN, Number.POSITIVE_INFINITY, MAX_DURATION_SECONDS + 1, 1e39]) {
      expect(plausibleDuration(seconds), String(seconds)).toBeNull()
    }
  })
})

describe('storage paths', () => {
  it('builds paths inside the user folder', () => {
    expect(buildAudioPath(USER, TRACK, '.FLAC')).toBe(`${USER}/${TRACK}.flac`)
    expect(buildCoverPath(USER, TRACK)).toBe(`${USER}/${TRACK}.webp`)
  })

  it('only accepts the audio path of the right user and track', () => {
    expect(isAudioPath(`${USER}/${TRACK}.mp3`, USER, TRACK)).toBe(true)
    expect(isAudioPath(`other-user/${TRACK}.mp3`, USER, TRACK)).toBe(false)
    expect(isAudioPath(`${USER}/other-track.mp3`, USER, TRACK)).toBe(false)
    expect(isAudioPath(`${USER}/sub/${TRACK}.mp3`, USER, TRACK)).toBe(false)
    expect(isAudioPath(`${USER}/${TRACK}`, USER, TRACK)).toBe(false)
  })

  it('accepts only the extensions the database does: 1 to 10 lower-case letters and digits', () => {
    expect(isAudioPath(`${USER}/${TRACK}.opus`, USER, TRACK)).toBe(true)
    // Before: any extension passed, and these made the storage client throw (500) or the database refuse.
    for (const extension of ['mp\u00003', 'mp\u00013', 'MP3', 'mp3/..', 'abcdefghijk', '']) {
      expect(isAudioPath(`${USER}/${TRACK}.${extension}`, USER, TRACK), JSON.stringify(extension)).toBe(false)
    }
  })

  it('builds and accepts a replaced file\'s path, <trackId>.<revision>.<ext>, as the database does', () => {
    expect(buildAudioPath(USER, TRACK, 'flac', '0a1b2c3d')).toBe(`${USER}/${TRACK}.0a1b2c3d.flac`)
    expect(isAudioPath(`${USER}/${TRACK}.0a1b2c3d.flac`, USER, TRACK)).toBe(true)
    // A revision is exactly 8 lower-case hex characters, and there is one at most.
    for (const revision of ['0a1b2c', '0A1B2C3D', '0a1b2c3g', '0a1b2c3d.0a1b2c3d', '']) {
      expect(isAudioPath(`${USER}/${TRACK}.${revision}.flac`, USER, TRACK), revision).toBe(false)
    }
    // Only a revision path counts as one.
    expect(isAudioRevisionPath(`${USER}/${TRACK}.0a1b2c3d.flac`, USER, TRACK)).toBe(true)
    expect(isAudioRevisionPath(`${USER}/${TRACK}.flac`, USER, TRACK)).toBe(false)
    expect(isAudioRevisionPath(`${USER}/other-track.0a1b2c3d.flac`, USER, TRACK)).toBe(false)
  })

  it('draws revisions of 8 lower-case hex characters, a new one each time', () => {
    // A few draws: each one valid, and (4 random bytes) never the same twice here.
    const drawn = Array.from({ length: 20 }, newAudioRevision)
    for (const revision of drawn) expect(revision).toMatch(/^[0-9a-f]{8}$/)
    expect(new Set(drawn).size).toBe(drawn.length)
  })

  it('calls safe only the keys that name one file by a plain path', () => {
    // Every path the app builds is safe.
    expect(isSafeStorageKey(buildAudioPath(USER, TRACK, 'flac'))).toBe(true)
    expect(isSafeStorageKey(buildPlaylistCoverPath(USER, TRACK))).toBe(true)
    // URL parsing would resolve these to another file than they name.
    expect(isSafeStorageKey(`${USER}/../other/${TRACK}.flac`)).toBe(false)
    expect(isSafeStorageKey(`${USER}/./${TRACK}.flac`)).toBe(false)
    expect(isSafeStorageKey(`../${TRACK}.flac`)).toBe(false)
    // Empty segments, backslashes and control characters.
    expect(isSafeStorageKey(`${USER}//${TRACK}.flac`)).toBe(false)
    expect(isSafeStorageKey(`/${USER}/${TRACK}.flac`)).toBe(false)
    expect(isSafeStorageKey(`${USER}\\..\\${TRACK}.flac`)).toBe(false)
    expect(isSafeStorageKey(`${USER}/${TRACK}\u0000.flac`)).toBe(false)
    expect(isSafeStorageKey('')).toBe(false)
    // Dots inside a name are fine.
    expect(isSafeStorageKey(`${USER}/${TRACK}..flac`)).toBe(true)
  })
})

describe('computePeaks', () => {
  it('reduces to N normalized 0..1 values using the absolute peak', () => {
    // 8 samples whose loudest absolute value is 1 (the -1).
    const channel = [0, 0.5, -1, 0.25, 0, -0.5, 0.1, 0]
    expect(computePeaks([channel], 4)).toEqual([0.5, 1, 0.5, 0.1])
  })

  it('combines channels using the highest peak', () => {
    expect(computePeaks([[0.2, 0], [0, -0.4]], 2)).toEqual([0.5, 1])
  })

  it('never returns more values than available samples', () => {
    expect(computePeaks([[1, 1]], 1000)).toHaveLength(2)
  })

  it('handles silence and empty input', () => {
    expect(computePeaks([[0, 0, 0]], 3)).toEqual([0, 0, 0])
    expect(computePeaks([], 10)).toEqual([])
  })
})
