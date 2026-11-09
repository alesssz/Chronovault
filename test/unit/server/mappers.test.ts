/**
 * Row ↔ domain conversions; the shared view must expose only the shareable fields.
 */
import { describe, expect, it } from 'vitest'
import { toSharedTrack, toTrackDetail, toTrackInsert, toTrackUpdate, type TrackRow } from '~~/server/mappers/track'
import { toSharedPlaylistTrack } from '~~/server/mappers/playlist'
import { playlistCoverUrlOf, trackCoverUrlOf } from '~~/server/mappers/cover-urls'

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
  subgenre_id: null,
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
    // A shared track built from a get_shared_track() row (which still carries the audio path).
    const shared = toSharedTrack({
      id: TRACK, title: 'Night', composers: 'A, B', album: null, year: 2026, genre: 'Ambient',
      description: 'desc', lyrics: 'lyrics', lyrics_synced: [{ time: 1, text: 'lyrics' }],
      duration_seconds: 180.5, peaks: [0.1, 1], cover_path: `${USER}/${TRACK}.webp`,
      audio_path: `${USER}/${TRACK}.mp3`, visibility: 'public', status: 'draft', updated_at: '2026-10-18T11:00:00Z',
    }, 'https://signed/cover')

    expect(Object.keys(shared).sort()).toEqual([
      'album', 'composers', 'coverUrl', 'description', 'downloadable', 'durationSeconds', 'fileExtension', 'genre', 'id',
      'lyrics', 'lyricsSynced', 'peaks', 'status', 'title', 'updatedAt', 'visibility', 'year',
    ])
    expect(shared).toMatchObject({ genre: 'Ambient', visibility: 'public', coverUrl: 'https://signed/cover', fileExtension: 'mp3' })
    // A public track is never offered for download.
    expect(shared.downloadable).toBe(false)
    // The extension only: the path, which holds the owner's id, stays on the server.
    expect(JSON.stringify(shared)).not.toContain(USER)
  })
})

describe('toSharedPlaylistTrack', () => {
  it('gives a playlist track the same shareable fields as a shared track page, without visibility', () => {
    // A playlist track built from a get_shared_playlist_tracks() row, covers signed by a fake.
    const shared = toSharedPlaylistTrack({
      id: TRACK, title: 'Night', composers: 'A, B', album: null, year: 2026, genre: 'Ambient',
      description: 'desc', lyrics: 'lyrics', lyrics_synced: [{ time: 1, text: 'lyrics' }],
      duration_seconds: 180.5, peaks: [0.1, 1], cover_path: `${USER}/${TRACK}.webp`,
      audio_path: `${USER}/${TRACK}.mp3`, position: 3, visibility: 'private', status: 'draft', updated_at: '2026-10-18T11:00:00Z',
    }, path => (path ? `https://signed/${path}` : null))

    expect(Object.keys(shared).sort()).toEqual([
      'album', 'composers', 'coverUrl', 'description', 'downloadable', 'durationSeconds', 'fileExtension', 'genre', 'id',
      'lyrics', 'lyricsSynced', 'peaks', 'status', 'title', 'updatedAt', 'year',
    ])
    // A private track of a shared playlist downloads through it; its visibility itself is not sent.
    expect(shared).toMatchObject({ status: 'draft', coverUrl: `https://signed/${USER}/${TRACK}.webp`, fileExtension: 'mp3', downloadable: true })
  })

  it('never offers a public track for download, whatever the playlist', () => {
    // The same row, the track public.
    const shared = toSharedPlaylistTrack({
      id: TRACK, title: 'Night', composers: null, album: null, year: null, genre: null,
      description: null, lyrics: null, lyrics_synced: null, duration_seconds: null, peaks: null, cover_path: null,
      audio_path: `${USER}/${TRACK}.flac`, position: 1, visibility: 'public', status: 'final', updated_at: '2026-10-18T11:00:00Z',
    }, () => null)
    expect(shared.downloadable).toBe(false)
  })
})

describe('cover addresses', () => {
  // Version of the row's updated_at, as cover-urls.ts writes it.
  const v = Date.parse(row.updated_at).toString(36)

  it('builds versioned addresses for items with a cover', () => {
    expect(trackCoverUrlOf({ id: TRACK, cover_path: 'x.webp', updated_at: row.updated_at })).toBe(`/api/covers/tracks/${TRACK}?v=${v}`)
    expect(playlistCoverUrlOf({ id: 'p1', cover_path: 'y.webp', updated_at: row.updated_at })).toBe(`/api/covers/playlists/p1?v=${v}`)
  })

  it('gives null without a cover', () => {
    expect(trackCoverUrlOf({ id: TRACK, cover_path: null, updated_at: row.updated_at })).toBeNull()
    expect(playlistCoverUrlOf({ id: 'p1', cover_path: null, updated_at: row.updated_at })).toBeNull()
  })
})

describe('toTrackInsert', () => {
  it('applies defaults for optional fields', () => {
    // An insert built from the bare minimum of a new track.
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
    // An insert that asks for a status.
    const insert = toTrackInsert(USER, {
      id: TRACK, title: 'New', audioPath: `${USER}/${TRACK}.wav`, mimeType: 'audio/wav', sizeBytes: 42, status: 'final',
    })
    expect(insert.status).toBe('final')
  })
})

describe('toTrackUpdate', () => {
  it('only includes present fields, mapping column names', () => {
    // Only the three fields given, under their column names.
    expect(toTrackUpdate({ sunoPrompt: 'p', genreId: null, subgenreId: null, coverPath: null })).toEqual({
      suno_prompt: 'p',
      genre_id: null,
      subgenre_id: null,
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
