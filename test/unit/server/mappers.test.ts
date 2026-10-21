/**
 * Row ↔ domain conversions; the shared view must expose only the shareable fields.
 */
import { describe, expect, it } from 'vitest'
import { toSharedTrack, toTrackDetail, toTrackInsert, toTrackUpdate, type TrackRow } from '~~/server/mappers/track'

// Fixed ids for the row below.
const USER = '11111111-1111-4111-8111-111111111111'
const TRACK = '22222222-2222-4222-8222-222222222222'

/** A complete row with every kind of value (texts, nulls, JSON, generated flags). */
const row: TrackRow = {
  id: TRACK,
  user_id: USER,
  title: 'Night',
  composers: 'A, B',
  genre_id: null,
  year: 2026,
  album: null,
  description: 'desc',
  suno_prompt: null,
  mastered: true,
  visibility: 'unlisted',
  status: 'draft',
  lyrics: 'lyrics',
  lyrics_synced: [{ time: 1, text: 'lyrics' }],
  has_lyrics: true,
  has_synced_lyrics: true,
  audio_path: `${USER}/${TRACK}.mp3`,
  cover_path: null,
  mime_type: 'audio/mpeg',
  size_bytes: 1000,
  duration_seconds: 180.5,
  peaks: [0.1, 1],
  created_at: '2026-10-18T10:00:00Z',
  updated_at: '2026-10-18T11:00:00Z',
}

describe('toTrackDetail', () => {
  it('converts snake_case to camelCase and includes the cacheable cover address', () => {
    // Same row with a cover: the address is versioned by updated_at.
    const detail = toTrackDetail({ ...row, cover_path: `${USER}/${TRACK}.webp` })
    expect(detail).toMatchObject({
      id: TRACK,
      title: 'Night',
      sunoPrompt: null,
      visibility: 'unlisted',
      durationSeconds: 180.5,
      hasLyrics: true,
      hasSyncedLyrics: true,
      lyricsSynced: [{ time: 1, text: 'lyrics' }],
      peaks: [0.1, 1],
      coverUrl: `/api/covers/tracks/${TRACK}?v=${Date.parse(row.updated_at).toString(36)}`,
      audioPath: `${USER}/${TRACK}.mp3`,
    })
    expect(detail).not.toHaveProperty('user_id')
  })
})

describe('toSharedTrack', () => {
  it('exposes only the shareable fields: no Suno prompt, mastering, owner or storage paths', () => {
    const shared = toSharedTrack({
      id: TRACK, title: 'Night', composers: 'A, B', album: null, year: 2026, genre: 'Ambient',
      description: 'desc', lyrics: 'lyrics', lyrics_synced: [{ time: 1, text: 'lyrics' }],
      duration_seconds: 180.5, peaks: [0.1, 1], cover_path: `${USER}/${TRACK}.webp`,
      audio_path: `${USER}/${TRACK}.mp3`, visibility: 'public', status: 'draft', updated_at: '2026-10-18T11:00:00Z',
    }, 'https://signed/cover')

    expect(Object.keys(shared).sort()).toEqual([
      'album', 'composers', 'coverUrl', 'description', 'durationSeconds', 'genre', 'id', 'lyrics',
      'lyricsSynced', 'peaks', 'status', 'title', 'updatedAt', 'visibility', 'year',
    ])
    expect(shared).toMatchObject({ genre: 'Ambient', visibility: 'public', coverUrl: 'https://signed/cover' })
  })
})

describe('toTrackInsert', () => {
  it('applies defaults for optional fields', () => {
    const insert = toTrackInsert(USER, {
      id: TRACK,
      title: 'New',
      audioPath: `${USER}/${TRACK}.wav`,
      mimeType: 'audio/wav',
      sizeBytes: 42,
    })
    expect(insert).toMatchObject({
      id: TRACK,
      user_id: USER,
      title: 'New',
      mastered: false,
      visibility: 'private',
      composers: null,
      cover_path: null,
      peaks: null,
    })
    // No status: the database default makes a new upload a draft.
    expect(insert).not.toHaveProperty('status')
  })

  it('keeps an explicit status', () => {
    const insert = toTrackInsert(USER, {
      id: TRACK, title: 'New', audioPath: `${USER}/${TRACK}.wav`, mimeType: 'audio/wav', sizeBytes: 42, status: 'final',
    })
    expect(insert.status).toBe('final')
  })
})

describe('toTrackUpdate', () => {
  it('only includes present fields, mapping column names', () => {
    expect(toTrackUpdate({ sunoPrompt: 'p', genreId: null, coverPath: null })).toEqual({
      suno_prompt: 'p',
      genre_id: null,
      cover_path: null,
    })
  })

  it('maps the draft/final status', () => {
    expect(toTrackUpdate({ status: 'final' })).toEqual({ status: 'final' })
  })

  it('adds no keys for undefined fields', () => {
    expect(toTrackUpdate({ title: 'x', album: undefined })).toEqual({ title: 'x' })
  })
})
