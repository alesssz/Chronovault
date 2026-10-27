/**
 * Shared Zod schemas (client forms and API bodies): trimming, nulls, limits, duplicates, and the
 * NUL character refused in every text.
 */
import { describe, expect, it } from 'vitest'
import { trackCreateSchema, trackMetadataSchema, trackUpdateSchema } from '~~/shared/schemas/track'
import { playlistCreateSchema, playlistListQuerySchema, playlistTracksSchema, playlistUpdateSchema } from '~~/shared/schemas/playlist'
import { analyticsQuerySchema } from '~~/shared/schemas/analytics'
import { playRecordSchema, versionVoteSchema, voterQuerySchema } from '~~/shared/schemas/feedback'

/** A valid edit form, with spaces and empty texts the schema must normalize. */
const validMetadata = {
  title: '  Night  ',
  composers: '',
  genreId: null,
  year: 2026,
  album: 'Album',
  description: '',
  sunoPrompt: 'lo-fi, piano',
  mastered: false,
  visibility: 'private' as const,
  status: 'final' as const,
  lyrics: '',
  lyricsSynced: null,
}

describe('text with a NUL character (U+0000)', () => {
  it('is refused in every text field: titles, optional texts, synced lines, votes', () => {
    // A text Postgres cannot store.
    const nul = 'a\u0000b'
    expect(trackUpdateSchema.safeParse({ title: nul }).success).toBe(false)
    expect(trackUpdateSchema.safeParse({ lyrics: nul }).success).toBe(false)
    expect(trackUpdateSchema.safeParse({ lyricsSynced: [{ time: 1, text: nul }] }).success).toBe(false)
    expect(playlistCreateSchema.safeParse({ title: nul }).success).toBe(false)
    expect(versionVoteSchema.safeParse({ voterId: crypto.randomUUID(), trackId: crypto.randomUUID(), comment: nul }).success).toBe(false)
    // Any other character is fine.
    expect(trackUpdateSchema.safeParse({ title: 'a\u0001b ♪' }).success).toBe(true)
  })
})

describe('trackMetadataSchema', () => {
  it('trims whitespace and turns empty texts into null', () => {
    // The metadata as the schema outputs it.
    const data = trackMetadataSchema.parse(validMetadata)
    expect(data.title).toBe('Night')
    expect(data.composers).toBeNull()
    expect(data.description).toBeNull()
    expect(data.lyrics).toBeNull()
    expect(data.sunoPrompt).toBe('lo-fi, piano')
  })

  it('requires a title', () => {
    // A blank title, checked.
    const result = trackMetadataSchema.safeParse({ ...validMetadata, title: '   ' })
    expect(result.success).toBe(false)
  })

  it('validates year and visibility', () => {
    expect(trackMetadataSchema.safeParse({ ...validMetadata, year: 999 }).success).toBe(false)
    expect(trackMetadataSchema.safeParse({ ...validMetadata, year: 2026.5 }).success).toBe(false)
    expect(trackMetadataSchema.safeParse({ ...validMetadata, visibility: 'secret' }).success).toBe(false)
  })

  it('validates synced lines', () => {
    expect(trackMetadataSchema.safeParse({ ...validMetadata, lyricsSynced: [{ time: 1, text: 'ok' }] }).success).toBe(true)
    expect(trackMetadataSchema.safeParse({ ...validMetadata, lyricsSynced: [{ time: -1, text: 'no' }] }).success).toBe(false)
  })
})

describe('trackCreateSchema', () => {
  /** The technical fields of a valid upload. */
  const base = {
    id: '22222222-2222-4222-8222-222222222222',
    title: 'Track',
    audioPath: 'user/track.mp3',
    mimeType: 'audio/mpeg',
    sizeBytes: 1024,
  }

  it('accepts the bare minimum', () => {
    expect(trackCreateSchema.safeParse(base).success).toBe(true)
  })

  it('rejects non-audio MIME types, empty files and out-of-range peaks', () => {
    expect(trackCreateSchema.safeParse({ ...base, mimeType: 'image/png' }).success).toBe(false)
    expect(trackCreateSchema.safeParse({ ...base, sizeBytes: 0 }).success).toBe(false)
    expect(trackCreateSchema.safeParse({ ...base, peaks: [0.5, 1.2] }).success).toBe(false)
  })

  it('rejects non-UUID ids', () => {
    expect(trackCreateSchema.safeParse({ ...base, id: 'abc' }).success).toBe(false)
  })
})

describe('trackUpdateSchema', () => {
  it('accepts partial updates', () => {
    expect(trackUpdateSchema.parse({ mastered: true })).toEqual({ mastered: true })
  })

  it('accepts removing the cover', () => {
    expect(trackUpdateSchema.parse({ coverPath: null })).toEqual({ coverPath: null })
  })

  it('rejects an empty body', () => {
    expect(trackUpdateSchema.safeParse({}).success).toBe(false)
  })
})

describe('playlist schemas', () => {
  // Two track ids.
  const A = 'a1111111-1111-4111-8111-111111111111'
  const B = 'a2222222-2222-4222-8222-222222222222'

  it('accepts an ordered list of distinct track ids', () => {
    expect(playlistTracksSchema.parse({ trackIds: [B, A] }).trackIds).toEqual([B, A])
  })

  it('rejects a track listed twice and ids that are not UUIDs', () => {
    expect(playlistTracksSchema.safeParse({ trackIds: [A, A] }).success).toBe(false)
    expect(playlistTracksSchema.safeParse({ trackIds: ['nope'] }).success).toBe(false)
  })

  it('a new playlist needs a title; empty descriptions become null', () => {
    expect(playlistCreateSchema.safeParse({ title: '  ' }).success).toBe(false)
    expect(playlistUpdateSchema.parse({ description: '' })).toEqual({ description: null })
    expect(playlistUpdateSchema.safeParse({}).success).toBe(false)
  })

  it('a playlist is created as a playlist or a group of versions, nothing else', () => {
    expect(playlistCreateSchema.parse({ title: 'Rain', purpose: 'versions' }).purpose).toBe('versions')
    expect(playlistCreateSchema.parse({ title: 'Rain' }).purpose).toBeUndefined()
    expect(playlistCreateSchema.safeParse({ title: 'Rain', purpose: 'album' }).success).toBe(false)
  })

  it('the purpose cannot change after creation', () => {
    // PATCH bodies ignore unknown keys: `purpose` never reaches the update.
    expect(playlistUpdateSchema.parse({ title: 'Rain', purpose: 'versions' })).toEqual({ title: 'Rain' })
  })

  it('lists curated playlists unless the groups of versions are asked for', () => {
    expect(playlistListQuerySchema.parse({}).purpose).toBe('playlist')
    expect(playlistListQuerySchema.parse({ purpose: 'versions' }).purpose).toBe('versions')
    expect(playlistListQuerySchema.safeParse({ purpose: 'album' }).success).toBe(false)
  })
})

describe('analyticsQuerySchema', () => {
  it('accepts the two periods (query strings) and defaults to 30 days', () => {
    expect(analyticsQuerySchema.parse({ days: '7' })).toEqual({ days: 7 })
    expect(analyticsQuerySchema.parse({})).toEqual({ days: 30 })
  })

  it('rejects any other period', () => {
    expect(analyticsQuerySchema.safeParse({ days: '90' }).success).toBe(false)
  })
})

describe('feedback schemas', () => {
  // Ids of a track, a playlist and a browser.
  const TRACK = '11111111-1111-4111-8111-111111111111'
  const LIST = '22222222-2222-4222-8222-222222222222'
  const BROWSER = '33333333-3333-4333-8333-333333333333'

  it('a play: no playlist and not completed unless said', () => {
    expect(playRecordSchema.parse({ trackId: TRACK, listenerId: BROWSER }))
      .toEqual({ trackId: TRACK, playlistId: null, listenerId: BROWSER, completed: false })
    expect(playRecordSchema.parse({ trackId: TRACK, playlistId: LIST, listenerId: BROWSER, completed: true }).playlistId).toBe(LIST)
  })

  it('a play needs real ids', () => {
    expect(playRecordSchema.safeParse({ trackId: 'nope', listenerId: BROWSER }).success).toBe(false)
    expect(playRecordSchema.safeParse({ trackId: TRACK }).success).toBe(false)
  })

  it('a vote: name and comment optional, trimmed, empty ones become null', () => {
    expect(versionVoteSchema.parse({ voterId: BROWSER, trackId: TRACK }))
      .toEqual({ voterId: BROWSER, trackId: TRACK, name: null, comment: null })
    expect(versionVoteSchema.parse({ voterId: BROWSER, trackId: TRACK, name: '  Ada ', comment: '' }))
      .toMatchObject({ name: 'Ada', comment: null })
  })

  it('a vote refuses a name or comment over the limits', () => {
    expect(versionVoteSchema.safeParse({ voterId: BROWSER, trackId: TRACK, name: 'x'.repeat(61) }).success).toBe(false)
    expect(versionVoteSchema.safeParse({ voterId: BROWSER, trackId: TRACK, comment: 'x'.repeat(1001) }).success).toBe(false)
  })

  it('whose vote: a browser id', () => {
    expect(voterQuerySchema.safeParse({ voter: BROWSER }).success).toBe(true)
    expect(voterQuerySchema.safeParse({ voter: 'me' }).success).toBe(false)
  })
})
