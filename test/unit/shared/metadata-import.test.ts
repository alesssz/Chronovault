/**
 * Metadata import, the part every format shares: which header names which column, how each cell
 * is read (an empty one sets nothing), and how the rows are matched to the library by title and
 * compared with it, long texts included (the export imported back changes nothing), every row
 * that cannot be applied said with why.
 */
import { describe, expect, it } from 'vitest'
import type { Genre, TrackMetadata } from '~~/shared/types/track'
import { columnOf, parseImportRows, planImport, type ImportRow } from '~~/shared/utils/metadata-import'

/** A library track (every metadata field) with defaults. */
function track(id: string, title: string, extra: Partial<TrackMetadata> = {}): TrackMetadata {
  return {
    id,
    title,
    composers: null,
    album: null,
    year: null,
    genreId: null,
    mastered: false,
    visibility: 'private',
    status: 'draft',
    description: null,
    sunoPrompt: null,
    lyrics: null,
    hasSyncedLyrics: false,
    ...extra,
  }
}

const GENRES: Genre[] = [
  { id: 'g-rock', name: 'Rock', custom: false },
  { id: 'g-pop', name: 'Pop', custom: false },
]

/** Rows from plain objects, numbered as a spreadsheet's (the header is row 1). */
function rows(...cells: Record<string, ImportRow['cells'][string]>[]): ImportRow[] {
  return cells.map((c, i) => ({ line: i + 2, cells: c }))
}

describe('columnOf', () => {
  it.each([
    ['title', 'title'],
    ['Title', 'title'],
    ['Suno prompt', 'suno_prompt'],
    ['suno_prompt', 'suno_prompt'],
    ['SunoPrompt', 'suno_prompt'],
    ['Composers / Authors', null],
    ['Composers', 'composers'],
    ['artist', 'composers'],
    ['Version', 'status'],
    ['Mastering', 'mastered'],
  ])('%s → %s', (header, column) => {
    expect(columnOf(header)).toBe(column)
  })

  it('knows nothing of other headers', () => {
    expect(columnOf('bpm')).toBeNull()
  })
})

describe('parseImportRows', () => {
  it('reads each kind of cell, and an empty cell sets nothing', () => {
    const parsed = parseImportRows(rows({
      title: ' Artemisia ',
      composers: 'Chronovault',
      album: '',
      year: '2026',
      genre: 'rock',
      lyrics: '[Verse]\nOne\nTwo',
      mastered: 'sì',
      status: 'Final',
      visibility: 'UNLISTED',
    }), ['title', 'composers', 'album', 'year', 'genre', 'lyrics', 'mastered', 'status', 'visibility'])
    expect(parsed.missingTitle).toBe(false)
    expect(parsed.rows).toEqual([{
      line: 2,
      title: 'Artemisia',
      fields: { composers: 'Chronovault', year: 2026, genre: 'rock', lyrics: '[Verse]\nOne\nTwo', mastered: true, status: 'final', visibility: 'unlisted' },
      errors: [],
    }])
  })

  it('takes the values Excel and JSON give as they are', () => {
    const parsed = parseImportRows(rows({ title: 'A', year: 2025, mastered: false }), ['title', 'year', 'mastered'])
    expect(parsed.rows[0]!.fields).toEqual({ year: 2025, mastered: false })
  })

  it('names every cell it cannot read', () => {
    const parsed = parseImportRows(rows({ title: 'A', year: 'soon', mastered: 'maybe', status: 'done', visibility: 'friends', album: 'x'.repeat(201) }), ['title', 'year', 'mastered', 'status', 'visibility', 'album'])
    expect(parsed.rows[0]!.errors).toEqual([
      'year: "soon" is not a year',
      'mastered: "maybe" is not yes or no',
      'status: "done" is not draft or final',
      'visibility: "friends" is not private, unlisted or public',
      'album: At most 200 characters',
    ])
  })

  it('drops rows without a title, and lists the headers it ignores', () => {
    const parsed = parseImportRows(rows({ title: 'A', bpm: '120' }, { title: '  ', bpm: '90' }), ['title', 'bpm', ''])
    expect(parsed.rows.map(r => r.title)).toEqual(['A'])
    expect(parsed.ignoredHeaders).toEqual(['bpm'])
  })

  it('refuses a file without a title column', () => {
    expect(parseImportRows(rows({ name2: 'A' }), ['name2']).missingTitle).toBe(true)
  })
})

describe('planImport', () => {
  const library = [
    track('t1', 'Artemisia', { album: 'Old', genreId: 'g-pop', hasSyncedLyrics: true }),
    track('t2', 'Night drive', { year: 2026, mastered: true }),
    track('t3', 'Twin'),
    track('t4', 'twin'),
  ]

  /** The plan of some rows against the library above. */
  const plan = (r: ImportRow[], headers: string[]) => planImport(parseImportRows(r, headers), library, GENRES)

  it('matches titles case aside and lists each change, before → after', () => {
    const result = plan(rows({ title: 'ARTEMISIA', album: 'History\'s Tales', genre: 'rock', lyrics: 'One\nTwo' }), ['title', 'album', 'genre', 'lyrics'])
    expect(result.updates).toEqual([{
      line: 2,
      trackId: 't1',
      title: 'Artemisia',
      fields: { album: 'History\'s Tales', genre: 'rock', lyrics: 'One\nTwo' },
      changes: [
        { column: 'album', from: 'Old', to: 'History\'s Tales' },
        { column: 'genre', from: 'Pop', to: 'Rock' },
        { column: 'lyrics', from: '', to: '2 lines' },
      ],
      syncedLyricsKept: true,
    }])
  })

  it('leaves out what is already so, and counts a row with nothing new as unchanged', () => {
    const result = plan(rows({ title: 'Night drive', year: '2026', mastered: 'yes' }), ['title', 'year', 'mastered'])
    expect(result.updates).toEqual([])
    expect(result.unchanged).toEqual([{ line: 2, title: 'Night drive' }])
  })

  it('compares the long texts too, line endings aside: the export imported back changes nothing', () => {
    const library = [track('t1', 'Song', { description: 'About it', sunoPrompt: 'baroque rock', lyrics: '[Verse]\nOne\nTwo' })]
    const same = planImport(parseImportRows(rows({ title: 'Song', description: 'About it', suno_prompt: 'baroque rock', lyrics: '[Verse]\r\nOne\r\nTwo' }), ['title', 'description', 'suno_prompt', 'lyrics']), library, GENRES)
    expect(same.updates).toEqual([])
    expect(same.unchanged).toEqual([{ line: 2, title: 'Song' }])

    const edited = planImport(parseImportRows(rows({ title: 'Song', description: 'New words', lyrics: '[Verse]\nOne\nThree' }), ['title', 'description', 'lyrics']), library, GENRES)
    expect(edited.updates[0]!.changes).toEqual([
      { column: 'description', from: 'About it', to: 'New words' },
      { column: 'lyrics', from: '3 lines', to: '3 lines, edited' },
    ])
  })

  it('finds a title whatever form its accents are written in', () => {
    // The library's title as file tags give it (i + combining accent), the file's as typed (one character).
    const library = [track('t1', 'The Tiger of Forli\u0300')]
    const result = planImport(parseImportRows(rows({ title: 'The Tiger of Forl\u00EC', album: 'X' }), ['title', 'album']), library, GENRES)
    expect(result.notFound).toEqual([])
    expect(result.updates.map(u => u.trackId)).toEqual(['t1'])
  })

  it('creates a genre it does not know, once', () => {
    const result = plan(rows({ title: 'Artemisia', genre: 'Dark Baroque' }, { title: 'Night drive', genre: 'dark baroque' }), ['title', 'genre'])
    expect(result.newGenres).toEqual(['Dark Baroque'])
    expect(result.updates.map(u => u.changes[0])).toEqual([
      { column: 'genre', from: 'Pop', to: 'Dark Baroque' },
      { column: 'genre', from: '', to: 'dark baroque' },
    ])
  })

  it('skips, with why: a title no track has, one several tracks share, one on two rows, a value it cannot read', () => {
    const result = plan(rows(
      { title: 'Nowhere', album: 'X' },
      { title: 'Twin', album: 'X' },
      { title: 'Night drive', album: 'A' },
      { title: 'night drive', album: 'B' },
      { title: 'Artemisia', year: 'soon' },
    ), ['title', 'album', 'year'])
    expect(result.updates).toEqual([])
    expect(result.notFound).toEqual([{ line: 2, title: 'Nowhere' }])
    expect(result.ambiguous).toEqual([{ line: 3, title: 'Twin', count: 2 }])
    expect(result.repeated).toEqual([{ title: 'Night drive', lines: [4, 5] }])
    expect(result.invalid).toEqual([{ line: 6, title: 'Artemisia', errors: ['year: "soon" is not a year'] }])
  })
})
