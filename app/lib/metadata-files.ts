/**
 * The metadata export and import's files (pages/tracks/import.vue): reading a
 * filled-in file, in any of the three formats, into rows for
 * shared/utils/metadata-import.ts, and writing the downloads: every metadata
 * field of every track, so one file is both the export and the template to
 * fill in (the template* functions; unchanged, it changes nothing when
 * imported).
 *
 * - Excel (.xlsx): read-excel-file and write-excel-file, their `universal`
 *   builds: the default ones run in Web Workers made from blob addresses,
 *   which the app's CSP (`worker-src 'self'`) refuses. The files are small.
 *   The first sheet is read; the download has the tracks there and a "Help"
 *   sheet after it. Its headers need not be on the first row (the download
 *   has a title, a note and the column groups above them): the row naming
 *   the most columns is taken (fromGrid).
 * - CSV (.csv, .tsv, .txt): parsed here (RFC 4180: quoted cells, "" for a
 *   quote, line breaks inside quotes). The separator is found from the header
 *   line: a comma, a semicolon (what Excel in Italian, and other languages
 *   that write decimals with a comma, saves) or a tab. The download is UTF-8
 *   with a byte-order mark, so Excel reads its accents right.
 * - JSON (.json): a list of objects, or `{ "tracks": [...] }`.
 */
import type { Genre, TrackMetadata } from '~~/shared/types/track'
import { IMPORT_COLUMNS, IMPORT_COLUMN_HELP, columnOf, yesNo, type ImportCell, type ImportColumn, type ImportRow } from '~~/shared/utils/metadata-import'

/** A file read: its headers in order, and its rows. */
export interface MetadataFile {
  headers: string[]
  rows: ImportRow[]
}

/** The formats, by what the page offers. */
export type MetadataFormat = 'xlsx' | 'csv' | 'json'

/** The file extensions the import takes (the file picker's `accept`). */
export const METADATA_FILE_ACCEPT = '.xlsx,.csv,.tsv,.txt,.json'

/** A file's format, from its name; null for one the import does not read. */
export function formatOf(fileName: string): MetadataFormat | null {
  const extension = fileName.toLowerCase().split('.').pop() ?? ''
  if (extension === 'xlsx') return 'xlsx'
  if (extension === 'json') return 'json'
  if (['csv', 'tsv', 'txt'].includes(extension)) return 'csv'
  return null
}

/** Rows searched for the headers: the Excel download puts a title, a note and the column groups above them. */
const HEADER_SEARCH_ROWS = 10

/** A row's cells as header names ('' for an empty cell). */
function headerNames(cells: ImportCell[]): string[] {
  return cells.map(cell => (cell === null || cell === undefined ? '' : String(cell).trim()))
}

/**
 * A grid of cells as headers and rows. The headers are the row, among the
 * first ten, that names the most known columns (the first row when none
 * does: the import then says there is no title column); the rows are the
 * ones under it, numbered as the sheet numbers them.
 */
export function fromGrid(grid: ImportCell[][]): MetadataFile {
  let headerIndex = 0
  let best = 0
  grid.slice(0, HEADER_SEARCH_ROWS).forEach((cells, index) => {
    const known = headerNames(cells).filter(name => columnOf(name) !== null).length
    if (known > best) {
      best = known
      headerIndex = index
    }
  })
  const headers = headerNames(grid[headerIndex] ?? [])
  const rows = grid.slice(headerIndex + 1).map((cells, index) => ({
    line: headerIndex + 2 + index,
    cells: Object.fromEntries(headers.map((header, column) => [header, cells[column]])),
  }))
  return { headers, rows }
}

// --- CSV ------------------------------------------------------------------------------

/** The separator of a CSV's header line: the most frequent of comma, semicolon and tab outside quotes. */
export function detectSeparator(text: string): string {
  // The first line, up to a line break outside quotes.
  let inQuotes = false
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 }
  for (const char of text) {
    if (char === '"') inQuotes = !inQuotes
    else if (!inQuotes && (char === '\n' || char === '\r')) break
    else if (!inQuotes && char in counts) counts[char]!++
  }
  // The most frequent; a comma for a header of one column.
  const [separator, count] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]!
  return count > 0 ? separator : ','
}

/** A CSV's cells (RFC 4180), the separator found from its header line. A byte-order mark is dropped. */
export function parseCsv(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, '')
  const separator = detectSeparator(source)
  const grid: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  for (let i = 0; i < source.length; i++) {
    const char = source[i]!
    if (inQuotes) {
      if (char === '"' && source[i + 1] === '"') {
        cell += '"'
        i++
      }
      else if (char === '"') inQuotes = false
      else cell += char
    }
    else if (char === '"') inQuotes = true
    else if (char === separator) {
      row.push(cell)
      cell = ''
    }
    else if (char === '\n' || char === '\r') {
      // \r\n is one line break.
      if (char === '\r' && source[i + 1] === '\n') i++
      row.push(cell)
      grid.push(row)
      row = []
      cell = ''
    }
    else cell += char
  }
  // The last line, unless the text ended with a line break.
  if (cell !== '' || row.length) {
    row.push(cell)
    grid.push(row)
  }
  // Inside a quoted cell, a line break is a line break: lyrics keep theirs.
  return grid.filter(cells => cells.some(c => c.trim() !== ''))
}

/** One CSV cell: quoted when it holds a quote, the separator or a line break. */
function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

// --- Reading ----------------------------------------------------------------------------

/** A JSON value as a cell (objects and lists are not cells: as text, so the row's check names them). */
function jsonCell(value: unknown): ImportCell {
  if (value === null || value === undefined || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  return JSON.stringify(value)
}

/** A JSON file's rows: a list of objects, or an object whose `tracks` is one. Throws a message for anything else. */
export function parseJson(text: string): MetadataFile {
  let data: unknown
  try {
    data = JSON.parse(text.replace(/^\uFEFF/, ''))
  }
  catch {
    throw new Error('This is not valid JSON.')
  }
  const list = Array.isArray(data) ? data : (data as { tracks?: unknown } | null)?.tracks
  if (!Array.isArray(list) || list.some(item => typeof item !== 'object' || item === null || Array.isArray(item))) {
    throw new Error('The JSON must be a list of objects, one per track (or { "tracks": [ … ] }).')
  }
  const objects = list as Record<string, unknown>[]
  // Every key met, in the order met.
  const headers = [...new Set(objects.flatMap(item => Object.keys(item)))]
  return {
    headers,
    rows: objects.map((item, index) => ({
      line: index + 1,
      cells: Object.fromEntries(Object.entries(item).map(([key, value]) => [key, jsonCell(value)])),
    })),
  }
}

/** Reads a filled-in file, by its extension. Throws a message the page shows. */
export async function readMetadataFile(file: File): Promise<MetadataFile> {
  const format = formatOf(file.name)
  if (format === 'json') return parseJson(await file.text())
  if (format === 'csv') return fromGrid(parseCsv(await file.text()))
  if (format === 'xlsx') {
    // Loaded only here: the import page is the only one that reads Excel.
    const { readSheet } = await import('read-excel-file/universal')
    let grid: ImportCell[][]
    try {
      grid = await readSheet(file) as ImportCell[][]
    }
    catch {
      throw new Error('This Excel file could not be read. Save it again as .xlsx, or as CSV.')
    }
    return fromGrid(grid)
  }
  throw new Error('Use an Excel (.xlsx), CSV or JSON file.')
}

// --- Downloads: the export, which is also the template to fill in ---------------------------

/** A download row: each column's value as text ('' for nothing). */
export type TemplateRow = Record<ImportColumn, string>

/** A genre or subgenre id's name (useGenres' genreName and subgenreName). */
type NameOf = (id: string | null) => string | null

/**
 * The download's rows: every track by title, with every field it has
 * (GET /api/tracks/metadata), the genre and subgenre by name. Synced lyrics
 * are not part of it: the import never changes them. Without tracks, one
 * example row shows the shape.
 */
export function templateRows(library: TrackMetadata[], genreName: NameOf, subgenreName: NameOf): TemplateRow[] {
  if (!library.length) {
    return [{
      title: 'My song',
      composers: 'Jane Doe',
      album: 'First album',
      year: '2026',
      genre: 'Rock',
      subgenre: 'Indie Rock',
      description: 'A few words about the song.',
      suno_prompt: 'dark baroque rock, harpsichord, violins',
      lyrics: '[Verse]\nFirst line\nSecond line',
      mastered: 'no',
      status: 'draft',
      visibility: 'private',
    }]
  }
  return [...library]
    .sort((a, b) => a.title.localeCompare(b.title, 'en'))
    .map(track => ({
      title: track.title,
      composers: track.composers ?? '',
      album: track.album ?? '',
      year: track.year === null ? '' : String(track.year),
      genre: genreName(track.genreId) ?? '',
      subgenre: subgenreName(track.subgenreId) ?? '',
      description: track.description ?? '',
      suno_prompt: track.sunoPrompt ?? '',
      lyrics: track.lyrics ?? '',
      mastered: yesNo(track.mastered),
      status: track.status,
      visibility: track.visibility,
    }))
}

/** The CSV download: a header line, then one line per track (lyrics on several lines in a quoted cell); UTF-8 with a byte-order mark. */
export function templateCsv(rows: TemplateRow[]): Blob {
  const lines = [IMPORT_COLUMNS.join(','), ...rows.map(row => IMPORT_COLUMNS.map(column => csvCell(row[column])).join(','))]
  return new Blob([`\uFEFF${lines.join('\r\n')}\r\n`], { type: 'text/csv;charset=utf-8' })
}

/** The JSON download: a list of objects; the year a number, mastered a boolean, an empty value null. */
export function templateJson(rows: TemplateRow[]): Blob {
  const objects = rows.map(row => Object.fromEntries(IMPORT_COLUMNS.map((column) => {
    const value = row[column]
    if (value === '') return [column, null]
    if (column === 'year') return [column, Number(value)]
    if (column === 'mastered') return [column, value === 'yes']
    return [column, value]
  })))
  return new Blob([`${JSON.stringify(objects, null, 2)}\n`], { type: 'application/json' })
}

/** The brand's colours (app/assets/css/main.css), for the Excel download. */
const COLOURS = {
  night900: '#0b1024',
  night800: '#182041',
  night700: '#323b5c',
  night300: '#c1c7d9',
  night200: '#dbdfec',
  night50: '#f5f7fa',
  gold400: '#d6a84e',
  gold100: '#fbebcb',
  gold50: '#fdf6e8',
  white: '#ffffff',
  errorBackground: '#fde2e1',
  errorText: '#9b1c1c',
}

/** The column groups over the headers, in the sheet's order. */
const COLUMN_GROUPS: { label: string, columns: ImportColumn[] }[] = [
  { label: 'Track', columns: ['title'] },
  { label: 'Credits', columns: ['composers', 'album', 'year', 'genre', 'subgenre'] },
  { label: 'State', columns: ['mastered', 'status', 'visibility'] },
  { label: 'Texts', columns: ['description', 'suno_prompt', 'lyrics'] },
]

/**
 * The Excel sheet's columns, IMPORT_COLUMNS' order (the CSV and JSON downloads
 * have it too): the short ones next to the title, the long texts last, so most
 * of a row is in view beside its title without scrolling (the title column is
 * not frozen: see templateXlsx).
 */
const SHEET_COLUMNS: ImportColumn[] = COLUMN_GROUPS.flatMap(group => group.columns)

/** Column widths, in characters: the long texts wider. */
const COLUMN_WIDTHS: Record<ImportColumn, number> = { title: 30, composers: 24, album: 24, year: 8, genre: 18, subgenre: 22, description: 44, suno_prompt: 44, lyrics: 44, mastered: 11, status: 10, visibility: 12 }

/** The long texts: wrapped, in rows of LONG_TEXT_ROW_HEIGHT. */
const LONG_TEXTS: ImportColumn[] = ['description', 'suno_prompt', 'lyrics']

/** A row with a long text, in points: three lines; the whole text shows when the cell is selected. */
const LONG_TEXT_ROW_HEIGHT = 45

/** Columns of short fixed values, centred. */
const CENTRED: ImportColumn[] = ['year', 'mastered', 'status', 'visibility']

/** Rows above the headers: the title, the note, the column groups. */
const ROWS_ABOVE_HEADERS = 3

/** A cell's 1-based column letter in a formula (A to L: never past Z). */
function columnLetter(column: ImportColumn): string {
  return String.fromCharCode(65 + SHEET_COLUMNS.indexOf(column))
}

/** Where the Help sheet's genre list is: its rows, for the formulas that look names up in it. */
interface GenreListRange {
  /** First row (1-based) of the list's data, in columns A (genre), B (subgenre) and C ("yours"). */
  first: number
  /** Last row of the list's data: the same as the first for an empty list (the formulas still need a range). */
  last: number
}

/**
 * Conditional formatting: a value the import would refuse turns red as it is
 * typed (mastered, status, visibility, year, genre, subgenre), down to row
 * 1000, so rows added under the tracks are checked too. Excel compares text
 * case aside. The genre and subgenre are looked up in the Help sheet's list
 * (`genres`): a genre not in it; a subgenre named like a genre, or like a
 * built-in subgenre (no "yours") of a genre other than the row's. A new
 * subgenre name stays as it is: the import creates it. Without a genre cell
 * the subgenre is not checked against one (the import takes the track's).
 */
function invalidValueRules(firstRow: number, genres: GenreListRange) {
  const lastRow = Math.max(firstRow + 1000, 1000)
  /** A rule on one column: the formula for its first cell, Excel moving it down. */
  const rule = (column: ImportColumn, formula: (cell: string) => string) => ({
    cellRange: { from: { row: firstRow, column: SHEET_COLUMNS.indexOf(column) + 1 }, to: { row: lastRow, column: SHEET_COLUMNS.indexOf(column) + 1 } },
    condition: { formula: formula(`${columnLetter(column)}${firstRow}`) },
    style: { backgroundColor: COLOURS.errorBackground, textColor: COLOURS.errorText, fontWeight: 'bold' as const },
  })
  /** A column of the Help sheet's genre list, as an absolute range. */
  const helpRange = (column: 'A' | 'B' | 'C') => `Help!$${column}$${genres.first}:$${column}$${genres.last}`
  /** The list's genre column. */
  const helpGenres = helpRange('A')
  /** Not empty, and none of the words. */
  const noneOf = (cell: string, words: string[]) => `AND(${cell}<>"",NOT(OR(${words.map(w => `${cell}="${w}"`).join(',')})))`
  return [
    rule('mastered', cell => noneOf(cell, ['yes', 'no', 'y', 'n', 'si', 'sì', 'x', 'true', 'false', '1', '0'])),
    rule('status', cell => noneOf(cell, ['draft', 'final', 'wip'])),
    rule('visibility', cell => noneOf(cell, ['private', 'unlisted', 'public'])),
    rule('year', cell => `AND(${cell}<>"",OR(NOT(ISNUMBER(${cell})),${cell}<1000,${cell}>9999,${cell}<>INT(${cell})))`),
    rule('genre', cell => `AND(${cell}<>"",COUNTIF(${helpGenres},${cell})=0)`),
    rule('subgenre', (cell) => {
      // The row's genre cell.
      const genre = `${columnLetter('genre')}${firstRow}`
      return `AND(${cell}<>"",OR(COUNTIF(${helpGenres},${cell})>0,AND(${genre}<>"",`
        + `COUNTIFS(${helpRange('B')},${cell},${helpGenres},"<>"&${genre},${helpRange('C')},"")>0)))`
    }),
  ]
}

/**
 * The Excel download, in the app's colours. The "Tracks" sheet: a dark band
 * with the title and how to fill it in, the column groups (Track, Credits,
 * State, Texts: the short columns next to the title, the long texts last),
 * the headers (title, the key, in gold), then one row per track, rows
 * alternately tinted, titles bold on gold; the header rows stay in view
 * while scrolling, and a value the import would refuse turns red. The
 * "Help" sheet says what each column takes, then lists the genres with their
 * subgenres (the user's own marked "yours"), which the red-value rules look
 * names up in. Read back by fromGrid, which finds the headers under the band.
 */
export async function templateXlsx(rows: TemplateRow[], genres: Genre[]): Promise<Blob> {
  const { default: writeExcelFile } = await import('write-excel-file/universal')
  const span = SHEET_COLUMNS.length
  /** Empty cells after a cell spanning the row (the sheet's structure keeps them). */
  const covered = (count: number) => Array.from({ length: count - 1 }, () => null)

  const band = [
    { value: 'Chronovault · Track metadata', type: String, columnSpan: span, backgroundColor: COLOURS.night900, textColor: COLOURS.gold400, fontWeight: 'bold' as const, fontSize: 16, alignVertical: 'center' as const, indent: 1, height: 36 },
    ...covered(span),
  ]
  const note = [
    {
      value: 'Your tracks\' metadata. Change what you want and import the file back: a value left as it is, or an empty cell, leaves that field as it is. Keep the titles as they are: they are how each row finds its track. A value in red is one the import will not take; the Help sheet says what each column takes.',
      type: String,
      columnSpan: span,
      backgroundColor: COLOURS.night800,
      textColor: COLOURS.night300,
      fontSize: 10,
      wrap: true,
      alignVertical: 'center' as const,
      indent: 1,
      height: 32,
    },
    ...covered(span),
  ]
  const groups = COLUMN_GROUPS.flatMap(group => [
    {
      value: group.label.toUpperCase(),
      type: String,
      columnSpan: group.columns.length,
      backgroundColor: group.columns.includes('title') ? COLOURS.gold400 : COLOURS.night700,
      textColor: group.columns.includes('title') ? COLOURS.night900 : COLOURS.white,
      fontWeight: 'bold' as const,
      fontSize: 9,
      align: 'center' as const,
      alignVertical: 'center' as const,
      height: 20,
    },
    ...covered(group.columns.length),
  ])
  const headers = SHEET_COLUMNS.map(column => ({
    value: column,
    type: String,
    fontWeight: 'bold' as const,
    backgroundColor: column === 'title' ? COLOURS.gold400 : COLOURS.night800,
    textColor: column === 'title' ? COLOURS.night900 : COLOURS.white,
    bottomBorderStyle: 'medium' as const,
    bottomBorderColor: COLOURS.gold400,
    align: CENTRED.includes(column) ? 'center' as const : 'left' as const,
    alignVertical: 'center' as const,
    height: 24,
  }))
  const body = rows.map((row, index) => SHEET_COLUMNS.map((column) => {
    const value = row[column]
    // A row with lyrics or a long text keeps three lines' height: Excel would otherwise grow it
    // to the whole text (forty lines of lyrics), and the list would no longer read as a list.
    const height = LONG_TEXTS.some(text => row[text].length > 0) ? LONG_TEXT_ROW_HEIGHT : undefined
    // Every cell of a row: a thin border, the row's tint, the text at the top.
    const style = {
      backgroundColor: column === 'title' ? COLOURS.gold50 : index % 2 ? COLOURS.night50 : COLOURS.white,
      borderStyle: 'thin' as const,
      borderColor: COLOURS.night200,
      alignVertical: 'top' as const,
      align: CENTRED.includes(column) ? 'center' as const : 'left' as const,
      fontWeight: column === 'title' ? 'bold' as const : undefined,
      wrap: LONG_TEXTS.includes(column),
      height,
    }
    if (column === 'year' && value !== '') return { value: Number(value), type: Number, ...style }
    return { value, type: String, ...style }
  }))

  // The Help sheet: the same band, then what each column takes.
  const helpBand = [
    { value: 'Chronovault · What each column takes', type: String, columnSpan: 2, backgroundColor: COLOURS.night900, textColor: COLOURS.gold400, fontWeight: 'bold' as const, fontSize: 16, alignVertical: 'center' as const, indent: 1, height: 36 },
    null,
  ]
  const helpHeaders = ['Column', 'What it takes'].map(value => ({ value, type: String, fontWeight: 'bold' as const, backgroundColor: COLOURS.night800, textColor: COLOURS.white, bottomBorderStyle: 'medium' as const, bottomBorderColor: COLOURS.gold400, height: 24, alignVertical: 'center' as const }))
  const helpRow = (name: string, text: string, index: number, key = false) => {
    const style = { backgroundColor: key ? COLOURS.gold50 : index % 2 ? COLOURS.night50 : COLOURS.white, borderStyle: 'thin' as const, borderColor: COLOURS.night200, alignVertical: 'top' as const }
    return [{ value: name, type: String, fontWeight: 'bold' as const, ...style }, { value: text, type: String, wrap: true, ...style }]
  }
  const help = [
    helpBand,
    helpHeaders,
    ...SHEET_COLUMNS.map((column, index) => helpRow(column, IMPORT_COLUMN_HELP[column], index, column === 'title')),
    helpRow('empty cells', 'An empty cell leaves that field as it is: fill in only what you want to change.', SHEET_COLUMNS.length),
    helpRow('new rows', 'A row whose title no track has is skipped, and listed on the import page with the others it skips.', SHEET_COLUMNS.length + 1),
  ]

  // Then the genres and subgenres: a title, headers, one row per subgenre (a genre's name on
  // each of its rows, so the red-value rules can look a subgenre's genre up). After a blank row.
  const genreTitle = [
    { value: 'Genres and subgenres', type: String, columnSpan: 3, backgroundColor: COLOURS.night900, textColor: COLOURS.gold400, fontWeight: 'bold' as const, fontSize: 13, alignVertical: 'center' as const, indent: 1, height: 28 },
    null,
    null,
  ]
  // The list's headers, like the column help's.
  const genreHeaders = ['Genre', 'Subgenre', 'Yours'].map(value => ({ value, type: String, fontWeight: 'bold' as const, backgroundColor: COLOURS.night800, textColor: COLOURS.white, bottomBorderStyle: 'medium' as const, bottomBorderColor: COLOURS.gold400, height: 24, alignVertical: 'center' as const }))
  // One row per subgenre: its genre, its name, and "yours" for the user's own (built-in ones have none, which the formulas test).
  const genreRows = genres.flatMap((genre, genreIndex) => genre.subgenres.map((subgenre) => {
    // Genres alternately tinted, so where one ends shows.
    const style = { backgroundColor: genreIndex % 2 ? COLOURS.night50 : COLOURS.white, borderStyle: 'thin' as const, borderColor: COLOURS.night200 }
    return [
      { value: genre.name, type: String, fontWeight: 'bold' as const, ...style },
      { value: subgenre.name, type: String, ...style },
      { value: subgenre.custom ? 'yours' : '', type: String, ...style },
    ]
  }))
  // The list's first data row (1-based): after the column help, a blank row, the title and the headers.
  const firstGenreRow = help.length + 4
  // The list's rows, after a blank one under the column help.
  const genreList = [[null, null, null], genreTitle, genreHeaders, ...genreRows]

  const firstDataRow = ROWS_ABOVE_HEADERS + 2
  return writeExcelFile([
    {
      data: [band, note, groups, headers, ...body],
      sheet: 'Tracks',
      columns: SHEET_COLUMNS.map(column => ({ width: COLUMN_WIDTHS[column] })),
      // The band, the groups and the headers stay in view. Not the title column: a frozen column
      // splits the band's merged cells at its edge, and scrolling right cut the title and the note.
      stickyRowsCount: ROWS_ABOVE_HEADERS + 1,
      showGridLines: false,
      conditionalFormatting: invalidValueRules(firstDataRow, { first: firstGenreRow, last: Math.max(firstGenreRow, firstGenreRow + genreRows.length - 1) }),
    },
    { data: [...help, ...genreList], sheet: 'Help', columns: [{ width: 22 }, { width: 90 }, { width: 8 }], showGridLines: false },
  ]).toBlob()
}
