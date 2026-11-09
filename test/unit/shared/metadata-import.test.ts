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
    subgenreId: null,
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

/** Two genres: built-in subgenres, and one of the user's own. */
const GENRES: Genre[] = [
  {
    id: 'g-rock',
    name: 'Rock',
    subgenres: [
      { id: 's-grunge', genreId: 'g-rock', name: 'Grunge', custom: false },
      { id: 's-mine', genreId: 'g-rock', name: 'Garage Gothic', custom: true },
    ],
  },
  { id: 'g-pop', name: 'Pop', subgenres: [{ id: 's-kpop', genreId: 'g-pop', name: 'K-Pop', custom: false }] },
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

  it('reads a date Excel gives as its day, which is no year; takes wip as draft', () => {
    // A cell Excel formats as a date comes back as a Date.
    const day = new Date(Date.UTC(2026, 4, 1))
    const parsed = parseImportRows(rows({ title: 'A', album: day, year: day, status: 'WIP' }), ['title', 'album', 'year', 'status'])
    expect(parsed.rows[0]!.fields).toEqual({ album: '2026-05-01', status: 'draft' })
    expect(parsed.rows[0]!.errors).toEqual(['year: "2026-05-01" is not a year'])
  })

  it('refuses a genre name the genre form would refuse', () => {
    const parsed = parseImportRows(rows({ title: 'A', genre: 'g'.repeat(61) }), ['title', 'genre'])
    expect(parsed.rows[0]!.errors).toEqual(['genre: At most 60 characters'])
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
      fields: { album: 'History\'s Tales', lyrics: 'One\nTwo' },
      genreId: 'g-rock',
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

  it('lists every short field that changes, with what it was', () => {
    const library = [track('t1', 'Song', { composers: 'Ada', year: 2025, genreId: 'g-gone', mastered: false, status: 'draft', visibility: 'private' })]
    const result = planImport(parseImportRows(rows({
      title: 'Song',
      composers: 'Bo',
      year: '2026',
      genre: 'Rock',
      mastered: 'yes',
      status: 'final',
      visibility: 'public',
    }), ['title', 'composers', 'year', 'genre', 'mastered', 'status', 'visibility']), library, GENRES)
    expect(result.updates[0]!.changes).toEqual([
      { column: 'composers', from: 'Ada', to: 'Bo' },
      { column: 'year', from: '2025', to: '2026' },
      // A genre the list no longer has: shown as empty.
      { column: 'genre', from: '', to: 'Rock' },
      { column: 'mastered', from: 'no', to: 'yes' },
      { column: 'status', from: 'draft', to: 'final' },
      { column: 'visibility', from: 'private', to: 'public' },
    ])
    expect(result.updates[0]!.fields).toEqual({ composers: 'Bo', year: 2026, mastered: true, status: 'final', visibility: 'public' })
    expect(result.updates[0]!.genreId).toBe('g-rock')
  })

  it('shows a field the track did not have as empty before', () => {
    const result = planImport(parseImportRows(rows({ title: 'Twin', composers: 'Ada', year: '2026', description: 'About it', suno_prompt: 'rock' }), ['title', 'composers', 'year', 'description', 'suno_prompt']), [track('t3', 'Twin')], GENRES)
    expect(result.updates[0]!.changes).toEqual([
      { column: 'composers', from: '', to: 'Ada' },
      { column: 'year', from: '', to: '2026' },
      { column: 'description', from: '', to: 'About it' },
      { column: 'suno_prompt', from: '', to: 'rock' },
    ])
  })

  it('compares the long texts too, line endings aside: the export imported back changes nothing', () => {
    const library = [track('t1', 'Song', { description: 'About it', sunoPrompt: 'baroque rock', lyrics: '[Verse]\nOne\nTwo' })]
    const same = planImport(parseImportRows(rows({ title: 'Song', description: 'About it', suno_prompt: 'baroque rock', lyrics: '[Verse]\r\nOne\r\nTwo' }), ['title', 'description', 'suno_prompt', 'lyrics']), library, GENRES)
    expect(same.updates).toEqual([])
    expect(same.unchanged).toEqual([{ line: 2, title: 'Song' }])

    const long = `${'A long description, '.repeat(4)}and more.`
    const edited = planImport(parseImportRows(rows({ title: 'Song', description: long, suno_prompt: 'synthwave', lyrics: '[Verse]\nOne\nThree' }), ['title', 'description', 'suno_prompt', 'lyrics']), library, GENRES)
    expect(edited.updates[0]!.changes).toEqual([
      // Long texts shortened to 60 characters for the preview.
      { column: 'description', from: 'About it', to: `${long.slice(0, 57)}…` },
      { column: 'suno_prompt', from: 'baroque rock', to: 'synthwave' },
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

  it('takes only a genre of the list: another name skips the row, with why', () => {
    // A genre name the list does not have: genres are never created.
    const result = plan(rows({ title: 'Artemisia', genre: 'Dark Baroque' }), ['title', 'genre'])
    expect(result.updates).toEqual([])
    expect(result.invalid).toEqual([{ line: 2, title: 'Artemisia', errors: ['genre: "Dark Baroque" is not one of the genres'] }])
  })

  it('takes a subgenre of the row\'s genre, else of the track\'s, and a built-in one brings its genre', () => {
    const result = plan(rows(
      // Artemisia is Pop: the row's genre decides.
      { title: 'Artemisia', genre: 'rock', subgenre: 'grunge' },
      // Night drive has no genre: a built-in subgenre brings its own.
      { title: 'Night drive', subgenre: 'K-pop' },
    ), ['title', 'genre', 'subgenre'])
    expect(result.updates.map(u => [u.genreId, u.subgenre, u.changes])).toEqual([
      ['g-rock', { id: 's-grunge' }, [{ column: 'genre', from: 'Pop', to: 'Rock' }, { column: 'subgenre', from: '', to: 'Grunge' }]],
      ['g-pop', { id: 's-kpop' }, [{ column: 'genre', from: '', to: 'Pop' }, { column: 'subgenre', from: '', to: 'K-Pop' }]],
    ])
    expect(result.newSubgenres).toEqual([])
  })

  it('creates a new subgenre under its genre, once however many rows name it', () => {
    // Two Rock tracks, each named with the same new subgenre (spelled two ways).
    const library = [track('t1', 'One', { genreId: 'g-rock' }), track('t2', 'Two', { genreId: 'g-rock' })]
    const result = planImport(parseImportRows(rows(
      { title: 'One', subgenre: 'Dark Surf' },
      { title: 'Two', subgenre: 'dark surf' },
    ), ['title', 'subgenre']), library, GENRES)
    // The subgenre to create, as first spelled, which both rows then use.
    const created = { genreId: 'g-rock', genreName: 'Rock', name: 'Dark Surf' }
    expect(result.newSubgenres).toEqual([created])
    expect(result.updates.map(u => u.subgenre)).toEqual([created, created])
    expect(result.updates.map(u => u.genreId)).toEqual([undefined, undefined])
  })

  it('skips a subgenre incoherent with its genre, or with no genre at all, with why', () => {
    // A Pop track, and two without a genre.
    const library = [track('t1', 'One', { genreId: 'g-pop' }), track('t2', 'Two'), track('t3', 'Three')]
    const result = planImport(parseImportRows(rows(
      { title: 'One', genre: 'Pop', subgenre: 'Grunge' },
      { title: 'Two', genre: 'Pop', subgenre: 'Rock' },
      { title: 'Three', subgenre: 'Something new' },
    ), ['title', 'genre', 'subgenre']), library, GENRES)
    expect(result.updates).toEqual([])
    expect(result.invalid.map(i => i.errors)).toEqual([
      ['subgenre: Grunge belongs to Rock'],
      ['subgenre: Rock is a genre, not a subgenre'],
      ['subgenre: "Something new" needs a genre (the row has none, nor has the track)'],
    ])
    expect(result.newSubgenres).toEqual([])
  })

  it('says a new genre without a subgenre clears the old one; the same ones again change nothing', () => {
    // A Rock track in one of the user's own subgenres.
    const library = [track('t1', 'Song', { genreId: 'g-rock', subgenreId: 's-mine' })]
    // Another genre, no subgenre cell.
    const moved = planImport(parseImportRows(rows({ title: 'Song', genre: 'Pop' }), ['title', 'genre']), library, GENRES)
    expect(moved.updates[0]!.changes).toEqual([
      { column: 'genre', from: 'Rock', to: 'Pop' },
      { column: 'subgenre', from: 'Garage Gothic', to: '' },
    ])
    // The server clears it: no subgenre is sent.
    expect(moved.updates[0]!.subgenre).toBeUndefined()

    // The same genre and subgenre, case aside.
    const same = planImport(parseImportRows(rows({ title: 'Song', genre: 'rock', subgenre: 'garage gothic' }), ['title', 'genre', 'subgenre']), library, GENRES)
    expect(same.unchanged).toEqual([{ line: 2, title: 'Song' }])
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
