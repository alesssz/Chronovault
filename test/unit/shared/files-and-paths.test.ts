/**
 * Audio file type detection, storage extensions, fallback titles and storage path rules.
 */
import { describe, expect, it } from 'vitest'
import { resolveAudioMimeType, storageExtension, titleFromFileName } from '~~/shared/utils/audio-files'
import { buildAudioPath, buildCoverPath, isTrackPath } from '~~/shared/utils/storage-paths'
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

describe('storage paths', () => {
  it('builds paths inside the user folder', () => {
    expect(buildAudioPath(USER, TRACK, '.FLAC')).toBe(`${USER}/${TRACK}.flac`)
    expect(buildCoverPath(USER, TRACK)).toBe(`${USER}/${TRACK}.webp`)
  })

  it('only accepts paths of the right user and track', () => {
    expect(isTrackPath(`${USER}/${TRACK}.mp3`, USER, TRACK)).toBe(true)
    expect(isTrackPath(`other-user/${TRACK}.mp3`, USER, TRACK)).toBe(false)
    expect(isTrackPath(`${USER}/other-track.mp3`, USER, TRACK)).toBe(false)
    expect(isTrackPath(`${USER}/sub/${TRACK}.mp3`, USER, TRACK)).toBe(false)
    expect(isTrackPath(`${USER}/${TRACK}`, USER, TRACK)).toBe(false)
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
