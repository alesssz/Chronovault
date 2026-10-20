import { describe, expect, it } from 'vitest'
import { trackCreateSchema, trackMetadataSchema, trackUpdateSchema } from '~~/shared/schemas/track'

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
  lyrics: '',
  lyricsSynced: null,
}

describe('trackMetadataSchema', () => {
  it('trims whitespace and turns empty texts into null', () => {
    const data = trackMetadataSchema.parse(validMetadata)
    expect(data.title).toBe('Night')
    expect(data.composers).toBeNull()
    expect(data.description).toBeNull()
    expect(data.lyrics).toBeNull()
    expect(data.sunoPrompt).toBe('lo-fi, piano')
  })

  it('requires a title', () => {
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
