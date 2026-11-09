/**
 * Metadata import files: CSV as Excel and other tools save it (comma, semicolon or tab, quoted
 * cells with line breaks, a byte-order mark), JSON lists, and every download (the export, and the
 * template to fill in) read back as the import reads a filled-in file: Excel, CSV and JSON give the
 * same rows, long texts and line breaks included.
 */
import { describe, expect, it } from 'vitest'
import type { Genre, TrackMetadata } from '~~/shared/types/track'
import { parseImportRows, planImport } from '~~/shared/utils/metadata-import'
import { detectSeparator, formatOf, parseCsv, parseJson, readMetadataFile, templateCsv, templateJson, templateRows, templateXlsx } from '~/lib/metadata-files'

describe('formatOf', () => {
  it.each([
    ['tracks.xlsx', 'xlsx'],
    ['Tracks.CSV', 'csv'],
    ['tracks.tsv', 'csv'],
    ['tracks.txt', 'csv'],
    ['tracks.json', 'json'],
    ['tracks.xls', null],
    ['tracks', null],
  ])('%s → %s', (name, format) => {
    expect(formatOf(name)).toBe(format)
  })
})

describe('CSV', () => {
  it('finds the separator from the header line, outside quotes', () => {
    expect(detectSeparator('title,album\nA,B')).toBe(',')
    expect(detectSeparator('title;album;year\nA;B,C;2026')).toBe(';')
    expect(detectSeparator('title\talbum')).toBe('\t')
    expect(detectSeparator('"a;b;c",album\n')).toBe(',')
    expect(detectSeparator('title')).toBe(',')
  })

  it('reads quoted cells, doubled quotes and line breaks inside them', () => {
    const text = '\uFEFFtitle;lyrics;description\r\nArtemisia;"[Verse]\r\nOne\nTwo";"She said ""no"""\r\n\r\nNight drive;;\r\n'
    expect(parseCsv(text)).toEqual([
      ['title', 'lyrics', 'description'],
      ['Artemisia', '[Verse]\r\nOne\nTwo', 'She said "no"'],
      ['Night drive', '', ''],
    ])
  })

  it('keeps the last line without a final line break', () => {
    expect(parseCsv('title\nA')).toEqual([['title'], ['A']])
  })
})

describe('JSON', () => {
  it('takes a list of objects, or { tracks: [...] }, keys in the order met', () => {
    const file = parseJson('{ "tracks": [{ "title": "A", "year": 2026 }, { "title": "B", "mastered": true }] }')
    expect(file.headers).toEqual(['title', 'year', 'mastered'])
    expect(file.rows).toEqual([
      { line: 1, cells: { title: 'A', year: 2026 } },
      { line: 2, cells: { title: 'B', mastered: true } },
    ])
  })

  it('says what is wrong with anything else', () => {
    expect(() => parseJson('{ nope')).toThrow('This is not valid JSON.')
    expect(() => parseJson('{ "title": "A" }')).toThrow(/list of objects/)
    expect(() => parseJson('["A"]')).toThrow(/list of objects/)
  })
})

describe('templates', () => {
  /** A library track (every metadata field) with defaults. */
  const track = (title: string, extra: Partial<TrackMetadata> = {}): TrackMetadata => ({
    id: title,
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
  })
  const library = [
    track('Night drive, "live"', {
      composers: 'Ada; Bo',
      year: 2026,
      genreId: 'g-rock',
      subgenreId: 's-grunge',
      mastered: true,
      status: 'final',
      visibility: 'unlisted',
      description: 'She said "go", at night',
      sunoPrompt: 'synthwave; 120 bpm',
      lyrics: '[Verse]\nOne, two\n"Three"',
    }),
    track('Artemisia'),
  ]
  /** Rock, with a built-in subgenre and one of the user's own. */
  const genres: Genre[] = [{
    id: 'g-rock',
    name: 'Rock',
    subgenres: [
      { id: 's-grunge', genreId: 'g-rock', name: 'Grunge', custom: false },
      { id: 's-mine', genreId: 'g-rock', name: 'Garage Gothic', custom: true },
    ],
  }]
  // The download's rows, the names looked up as useGenres does.
  const rows = templateRows(library, id => (id === 'g-rock' ? 'Rock' : null), id => (id === 's-grunge' ? 'Grunge' : null))

  it('lists the library by title, with every field', () => {
    expect(rows.map(r => r.title)).toEqual(['Artemisia', 'Night drive, "live"'])
    expect(rows[1]).toEqual({
      title: 'Night drive, "live"',
      composers: 'Ada; Bo',
      album: '',
      year: '2026',
      genre: 'Rock',
      subgenre: 'Grunge',
      description: 'She said "go", at night',
      suno_prompt: 'synthwave; 120 bpm',
      lyrics: '[Verse]\nOne, two\n"Three"',
      mastered: 'yes',
      status: 'final',
      visibility: 'unlisted',
    })
  })

  it('has an example row for an empty library', () => {
    expect(templateRows([], () => null, () => null)).toHaveLength(1)
  })

  /** A template read back as an uploaded file, then parsed as the import does. */
  async function readBack(blob: Blob, name: string) {
    const { headers, rows: read } = await readMetadataFile(new File([blob], name))
    return parseImportRows(read, headers).rows.map(r => ({ title: r.title, fields: r.fields, errors: r.errors }))
  }

  it('reads every format back to the same rows, which change nothing on the same library', async () => {
    const csv = await readBack(templateCsv(rows), 'chronovault-metadata.csv')
    const json = await readBack(templateJson(rows), 'chronovault-metadata.json')
    const xlsx = await readBack(await templateXlsx(rows, genres), 'chronovault-metadata.xlsx')
    expect(csv).toEqual([
      { title: 'Artemisia', fields: { mastered: false, status: 'draft', visibility: 'private' }, errors: [] },
      {
        title: 'Night drive, "live"',
        fields: {
          composers: 'Ada; Bo',
          year: 2026,
          genre: 'Rock',
          subgenre: 'Grunge',
          description: 'She said "go", at night',
          sunoPrompt: 'synthwave; 120 bpm',
          lyrics: '[Verse]\nOne, two\n"Three"',
          mastered: true,
          status: 'final',
          visibility: 'unlisted',
        },
        errors: [],
      },
    ])
    expect(json).toEqual(csv)
    expect(xlsx).toEqual(csv)
    // Imported back, the export changes nothing.
    const { headers, rows: read } = await readMetadataFile(new File([templateCsv(rows)], 'chronovault-metadata.csv'))
    const plan = planImport(parseImportRows(read, headers), library, genres)
    expect(plan.updates).toEqual([])
    expect(plan.unchanged).toHaveLength(2)
  })

  it('lists the genres and subgenres on the Excel Help sheet, the user\'s own marked', async () => {
    // The reader the import uses, here for the second sheet.
    const { readSheet } = await import('read-excel-file/universal')
    // The Help sheet's rows as text, empty cells as ''.
    const help = (await readSheet(new File([await templateXlsx(rows, genres)], 'chronovault-metadata.xlsx'), 'Help'))
      .map(row => row.map(cell => (cell === null ? '' : String(cell))))
    // The list: under its headers, one row per subgenre.
    const headers = help.findIndex(row => row[0] === 'Genre' && row[1] === 'Subgenre')
    expect(help[headers - 1]![0]).toBe('Genres and subgenres')
    expect(help.slice(headers + 1)).toEqual([
      ['Rock', 'Grunge', ''],
      ['Rock', 'Garage Gothic', 'yours'],
    ])
  })
})
