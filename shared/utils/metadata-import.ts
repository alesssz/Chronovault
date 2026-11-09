import { subgenreCreateSchema, trackMetadataSchema } from '../schemas/track'
import { TRACK_STATUSES, TRACK_VISIBILITIES, type Genre, type TrackMetadata, type TrackStatus, type TrackVisibility } from '../types/track'
import { findBuiltinSubgenre, findGenreByName, findSubgenreByName, subgenreNameProblem } from './genres'
import { foldCase } from './text'

/**
 * Metadata import: many tracks' metadata from one file (Excel, CSV or JSON),
 * matched to the library by title. This module is the part every format
 * shares, with no browser or file code (app/lib/metadata-files.ts reads the
 * files and writes the downloads, the export that is also the template):
 *   1. the columns, and how a header names one ("Suno prompt", "suno_prompt"…);
 *   2. each row's cells read into typed fields (parseImportRows): an empty
 *      cell is no field at all, so the import leaves that field as it is;
 *   3. the rows matched to the library and compared with every field of it,
 *      long texts included (planImport): what changes, and every row that
 *      cannot be applied, with why. The export imported back changes nothing.
 *      The genre must be one of the fixed list; the subgenre one of its genre's,
 *      or a new name coherent with it (created when the plan is applied).
 * Applying the plan (subgenres created, tracks saved) is the page's.
 */

/** The import's fields, in the downloads' order (Excel, CSV and JSON alike). `title` is the key, never changed. */
export const IMPORT_COLUMNS = [
  'title',
  'composers',
  'album',
  'year',
  'genre',
  'subgenre',
  'mastered',
  'status',
  'visibility',
  'description',
  'suno_prompt',
  'lyrics',
] as const

/** One of the import's columns. */
export type ImportColumn = (typeof IMPORT_COLUMNS)[number]

/** What each column holds and accepts: the Excel download's Help sheet and the page's column list say it. */
export const IMPORT_COLUMN_HELP: Record<ImportColumn, string> = {
  title: 'The track\'s title, exactly as in the library (case aside): how the row finds its track. Never changed.',
  composers: 'Free text, e.g. "Jane Doe, John Smith".',
  album: 'Free text.',
  year: 'A year, e.g. 2026.',
  genre: 'One of the genres (listed after the columns in the Help sheet, and on the import page); no other name is taken.',
  subgenre: 'A subgenre of the row\'s genre (its genre cell, else the track\'s genre): one of the list, one of yours, or a new name, created as yours. Not a genre\'s name, nor a subgenre of another genre. A new genre without a subgenre clears the old one.',
  description: 'Free text, shown on share pages and in the full-screen player.',
  suno_prompt: 'Free text, never shared.',
  lyrics: 'Plain lyrics, one line per line; [Verse], [Chorus]… become section headers. Synced lyrics are kept as they are.',
  mastered: 'yes or no.',
  status: 'draft or final.',
  visibility: 'private, unlisted or public.',
}

/**
 * A header folded to compare: lower case, without spaces, underscores and
 * dashes ("Suno prompt", "suno_prompt" and "SunoPrompt" are one column).
 */
function foldHeader(header: string): string {
  return header.trim().toLocaleLowerCase('en').replace(/[\s_-]+/g, '')
}

/** Every header a column answers to, folded: its own name and a few other names for it. */
const HEADER_NAMES: Record<ImportColumn, string[]> = {
  title: ['title', 'name', 'track'],
  composers: ['composers', 'composer', 'authors', 'author', 'artist', 'artists', 'composersauthors'],
  album: ['album'],
  year: ['year'],
  genre: ['genre'],
  subgenre: ['subgenre', 'subgenres', 'style'],
  description: ['description', 'about'],
  suno_prompt: ['sunoprompt', 'suno', 'prompt'],
  lyrics: ['lyrics'],
  mastered: ['mastered', 'mastering'],
  status: ['status', 'version'],
  visibility: ['visibility'],
}

/** A folded header → its column. */
const COLUMN_BY_HEADER = new Map<string, ImportColumn>(
  IMPORT_COLUMNS.flatMap(column => HEADER_NAMES[column].map(name => [name, column] as const)),
)

/** The column a header names, or null for one the import does not know (it is ignored, and said so). */
export function columnOf(header: string): ImportColumn | null {
  return COLUMN_BY_HEADER.get(foldHeader(header)) ?? null
}

/** A cell as the readers hand it over: CSV gives text, Excel and JSON also numbers, booleans and dates. */
export type ImportCell = string | number | boolean | Date | null | undefined

/** One row of the file: its cells by header, and where it is in the file (for the messages). */
export interface ImportRow {
  /** Spreadsheet row number (the header is row 1), or the item's number in a JSON list. */
  line: number
  /** Cells by the file's own header. */
  cells: Record<string, ImportCell>
}

/** The fields a row sets (an empty cell sets nothing). */
export interface ImportFields {
  composers?: string
  album?: string
  year?: number
  /** The genre's name, matched to the genres when the plan is made (an unknown one makes the row invalid). */
  genre?: string
  /** The subgenre's name, matched to the genre's subgenres when the plan is made (a new one is created when applied). */
  subgenre?: string
  description?: string
  sunoPrompt?: string
  lyrics?: string
  mastered?: boolean
  status?: TrackStatus
  visibility?: TrackVisibility
}

/** A row read: its title, the fields it sets, and what was wrong with its cells. */
export interface ParsedImportRow {
  line: number
  title: string
  fields: ImportFields
  /** One message per cell that could not be read ("year: not a year"); the row is skipped. */
  errors: string[]
}

/** The file's rows read, with what concerns the whole file. */
export interface ParsedImport {
  rows: ParsedImportRow[]
  /** Headers no column answers to: ignored. */
  ignoredHeaders: string[]
  /** No column answers to "title": nothing can be matched (the file is refused). */
  missingTitle: boolean
}

/** A cell with nothing in it: no value, or only spaces. */
function isEmpty(cell: ImportCell): boolean {
  return cell === null || cell === undefined || (typeof cell === 'string' && cell.trim() === '')
}

/** A cell as text (numbers and booleans as written, a date as its year-month-day). */
function cellText(cell: ImportCell): string {
  if (cell instanceof Date) return cell.toISOString().slice(0, 10)
  return String(cell).trim()
}

/** Words read as yes and as no, in English and Italian (the owner's spreadsheets may be either). */
const YES = new Set(['yes', 'y', 'true', '1', 'x', 'si', 'sì', 'mastered'])
const NO = new Set(['no', 'n', 'false', '0', 'not mastered'])

/** The first message of a value Zod refused (a refusal always has one). */
function firstIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]!.message
}

/**
 * A text field checked against the edit form's own rule (length, no NUL), or
 * its message. The schema turns '' into null, which cannot happen here: the
 * text is trimmed and a blank cell never gets this far (readCell).
 */
function textField(field: 'composers' | 'album' | 'description' | 'sunoPrompt' | 'lyrics', text: string): { value?: string, error?: string } {
  const result = trackMetadataSchema.shape[field].safeParse(text)
  return result.success ? { value: result.data! } : { error: firstIssue(result.error) }
}

/**
 * Reads a cell into its field. Returns the field's value, nothing for an
 * empty cell, or a message for a cell that cannot be read.
 */
function readCell(column: Exclude<ImportColumn, 'title'>, cell: ImportCell): { value?: unknown, error?: string } {
  if (isEmpty(cell)) return {}
  const text = cellText(cell)
  switch (column) {
    case 'composers':
    case 'album':
    case 'description':
    case 'lyrics':
      return textField(column, text)
    case 'suno_prompt':
      return textField('sunoPrompt', text)
    case 'year': {
      // A number from Excel or JSON, or digits from CSV ("2026", "2026.0").
      const year = typeof cell === 'number' ? cell : Number(text)
      return Number.isInteger(year) && year >= 1000 && year <= 9999 ? { value: year } : { error: `"${text}" is not a year` }
    }
    case 'genre':
    case 'subgenre': {
      // A name as the subgenre form takes it (length, no NUL); whether the lists know it is planImport's.
      const result = subgenreCreateSchema.shape.name.safeParse(text)
      return result.success ? { value: result.data } : { error: firstIssue(result.error) }
    }
    case 'mastered': {
      if (typeof cell === 'boolean') return { value: cell }
      const word = foldCase(text)
      if (YES.has(word)) return { value: true }
      if (NO.has(word)) return { value: false }
      return { error: `"${text}" is not yes or no` }
    }
    case 'status': {
      const word = foldCase(text) === 'wip' ? 'draft' : foldCase(text)
      return (TRACK_STATUSES as readonly string[]).includes(word) ? { value: word } : { error: `"${text}" is not draft or final` }
    }
    case 'visibility': {
      const word = foldCase(text)
      return (TRACK_VISIBILITIES as readonly string[]).includes(word) ? { value: word } : { error: `"${text}" is not private, unlisted or public` }
    }
  }
}

/** The field a column fills (its name in the API: `suno_prompt` → `sunoPrompt`). */
const FIELD_OF: Record<Exclude<ImportColumn, 'title'>, keyof ImportFields> = {
  composers: 'composers',
  album: 'album',
  year: 'year',
  genre: 'genre',
  subgenre: 'subgenre',
  description: 'description',
  suno_prompt: 'sunoPrompt',
  lyrics: 'lyrics',
  mastered: 'mastered',
  status: 'status',
  visibility: 'visibility',
}

/**
 * Reads every row's cells into fields. A row with no title at all is
 * dropped (a blank line at the end of a sheet); a title with no other cell
 * is kept, and changes nothing.
 */
export function parseImportRows(rows: ImportRow[], headers: string[]): ParsedImport {
  // Each header's column (null: ignored).
  const columns = new Map(headers.map(header => [header, columnOf(header)]))
  const ignoredHeaders = headers.filter(header => header.trim() !== '' && columns.get(header) === null)
  const titleHeader = headers.find(header => columns.get(header) === 'title')
  if (!titleHeader) return { rows: [], ignoredHeaders, missingTitle: true }

  const parsed: ParsedImportRow[] = []
  for (const row of rows) {
    const titleCell = row.cells[titleHeader]
    if (isEmpty(titleCell)) continue
    const fields: ImportFields = {}
    const errors: string[] = []
    for (const [header, column] of columns) {
      if (!column || column === 'title') continue
      const { value, error } = readCell(column, row.cells[header])
      if (error) errors.push(`${column}: ${error}`)
      else if (value !== undefined) Object.assign(fields, { [FIELD_OF[column]]: value })
    }
    parsed.push({ line: row.line, title: cellText(titleCell), fields, errors })
  }
  return { rows: parsed, ignoredHeaders, missingTitle: false }
}

/** One field that changes on a track, for the preview. */
export interface ImportChange {
  /** The column's name, as in the downloads. */
  column: Exclude<ImportColumn, 'title'>
  /** The value before, as shown ('' for none; long texts shortened). */
  from: string
  /** The new value, as shown (long texts shortened). */
  to: string
}

/** A track the import changes. */
export interface ImportUpdate {
  line: number
  trackId: string
  /** The library's title (the row's may differ in case). */
  title: string
  /** The fields to save, but the genre and subgenre (below, as ids). */
  fields: Omit<ImportFields, 'genre' | 'subgenre'>
  /** The new genre, when it changes (the server then clears the old subgenre, unless `subgenre` is set). */
  genreId?: string
  /** The new subgenre, when it changes: an existing one, or a new one created under its genre when applied. */
  subgenre?: { id: string } | NewSubgenre
  changes: ImportChange[]
  /** The lyrics change while the track has synced lyrics: those are kept, and may no longer match. */
  syncedLyricsKept: boolean
}

/** The import, ready to show and to apply. */
export interface ImportPlan {
  updates: ImportUpdate[]
  /** Rows whose values are already the track's. */
  unchanged: { line: number, title: string }[]
  /** Titles no track has. */
  notFound: { line: number, title: string }[]
  /** Titles several tracks share: the row cannot tell which (none is changed). */
  ambiguous: { line: number, title: string, count: number }[]
  /** Titles on more than one row of the file: none of those rows is applied. */
  repeated: { title: string, lines: number[] }[]
  /** Rows with a cell that could not be read. */
  invalid: { line: number, title: string, errors: string[] }[]
  /** Subgenres that do not exist yet: created (as the user's own) when the import is applied. */
  newSubgenres: NewSubgenre[]
}

/** A subgenre the import creates: its name, under a genre. */
export interface NewSubgenre {
  /** The genre it is created under. */
  genreId: string
  /** The genre's name, for the preview ("Metal › Swamp Metal"). */
  genreName: string
  /** The name, as first spelled in the file. */
  name: string
}

/** A row's genre and subgenre, matched to the lists: what changes, or why the row cannot be applied. */
interface GenrePlan {
  /** The new genre, when it changes. */
  genreId?: string
  /** The new subgenre, when it changes. */
  subgenre?: { id: string } | NewSubgenre
  /** The preview's lines. */
  changes: ImportChange[]
  /** The row's problems ("genre: …"): it is not applied. */
  errors: string[]
}

/**
 * Matches a row's genre and subgenre cells to the lists, against its track.
 * The genre: one of the list. The subgenre: under the genre cell's genre,
 * else (a built-in name) under its own genre, which the row then sets too,
 * else under the track's genre; one of that genre's, or a new name coherent
 * with it. A new genre without a subgenre cell clears the old subgenre (the
 * server does it; the preview says so).
 */
function planGenre(fields: ImportFields, track: TrackMetadata, genres: Genre[], pending: Map<string, NewSubgenre>): GenrePlan {
  // Nothing changes and nothing is wrong, until the cells say otherwise.
  const result: GenrePlan = { changes: [], errors: [] }
  // The track's genre as it is (undefined without one), for the preview's "before".
  const currentGenre = genres.find(g => g.id === track.genreId)
  // Its subgenre, among that genre's (built-in or the user's own).
  const currentSubgenre = currentGenre?.subgenres.find(s => s.id === track.subgenreId)

  // The genre the row names, if any.
  let genre: Genre | undefined
  if (fields.genre !== undefined) {
    genre = findGenreByName(genres, fields.genre)
    if (!genre) {
      result.errors.push(`genre: "${fields.genre}" is not one of the genres`)
      return result
    }
  }

  // The subgenre the row names: an existing one, or a new one, and its genre.
  let subgenre: { id: string, name: string } | NewSubgenre | undefined
  if (fields.subgenre !== undefined) {
    // Without a genre cell, a built-in name brings its own genre.
    genre ??= findBuiltinSubgenre(genres, fields.subgenre)?.genre ?? currentGenre
    if (!genre) {
      result.errors.push(`subgenre: "${fields.subgenre}" needs a genre (the row has none, nor has the track)`)
      return result
    }
    // The genre's subgenre with that name, built-in or the user's own: the one to use.
    const existing = findSubgenreByName(genre, fields.subgenre)
    if (existing) {
      subgenre = existing
    }
    else {
      // A new name: coherent with the genre, or the row is not applied (the editor's rule).
      const problem = subgenreNameProblem(genres, genre, fields.subgenre)
      if (problem) {
        result.errors.push(`subgenre: ${problem}`)
        return result
      }
      // One new subgenre per genre and name, however many rows name it (the first spelling).
      const key = `${genre.id}:${foldCase(fields.subgenre)}`
      if (!pending.has(key)) pending.set(key, { genreId: genre.id, genreName: genre.name, name: fields.subgenre })
      subgenre = pending.get(key)!
    }
  }

  if (genre && genre.id !== track.genreId) {
    result.genreId = genre.id
    result.changes.push({ column: 'genre', from: currentGenre?.name ?? '', to: genre.name })
    // A new genre without a subgenre: the old one goes (it belonged to the old genre).
    if (!subgenre && currentSubgenre) result.changes.push({ column: 'subgenre', from: currentSubgenre.name, to: '' })
  }
  if (subgenre && !('id' in subgenre && subgenre.id === track.subgenreId)) {
    result.subgenre = 'id' in subgenre ? { id: subgenre.id } : subgenre
    result.changes.push({ column: 'subgenre', from: currentSubgenre?.name ?? '', to: subgenre.name })
  }
  return result
}

/** Lyrics as the preview counts them. */
function lineCount(text: string): string {
  return `${text.split(/\r?\n/).length} lines`
}

/** Two long texts alike, line endings and outer spaces aside (Excel and CSV may write \r\n). */
function sameText(stored: string | null, text: string): boolean {
  const normal = (s: string) => s.replace(/\r\n?/g, '\n').trim()
  return normal(stored ?? '') === normal(text)
}

/** A long text shortened for the preview. */
function preview(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ').trim()
  return oneLine.length > 60 ? `${oneLine.slice(0, 57)}…` : oneLine
}

/** yes / no, as the downloads write it. */
export function yesNo(value: boolean): string {
  return value ? 'yes' : 'no'
}

/**
 * Matches the rows to the library by title (trimmed, case aside) and
 * compares each row with its track, every field (GET /api/tracks/metadata):
 * the export imported back unchanged changes nothing. Nothing is applied: what each row would
 * change, and every row that will not be applied, with why.
 */
export function planImport(parsed: ParsedImport, library: TrackMetadata[], genres: Genre[]): ImportPlan {
  // Every list empty, filled row by row.
  const plan: ImportPlan = { updates: [], unchanged: [], notFound: [], ambiguous: [], repeated: [], invalid: [], newSubgenres: [] }

  // The library's tracks by folded title (several when titles repeat).
  const tracksByTitle = new Map<string, TrackMetadata[]>()
  for (const track of library) {
    const key = foldCase(track.title)
    tracksByTitle.set(key, [...(tracksByTitle.get(key) ?? []), track])
  }
  // The file's rows by folded title: a title on two rows is applied from neither.
  const rowsByTitle = new Map<string, ParsedImportRow[]>()
  for (const row of parsed.rows) {
    const key = foldCase(row.title)
    rowsByTitle.set(key, [...(rowsByTitle.get(key) ?? []), row])
  }
  // New subgenres by genre and folded name, once each (the first spelling met).
  const newSubgenres = new Map<string, NewSubgenre>()

  for (const [key, rows] of rowsByTitle) {
    if (rows.length > 1) {
      plan.repeated.push({ title: rows[0]!.title, lines: rows.map(r => r.line) })
      continue
    }
    const row = rows[0]!
    if (row.errors.length) {
      plan.invalid.push({ line: row.line, title: row.title, errors: row.errors })
      continue
    }
    const tracks = tracksByTitle.get(key) ?? []
    if (!tracks.length) {
      plan.notFound.push({ line: row.line, title: row.title })
      continue
    }
    if (tracks.length > 1) {
      plan.ambiguous.push({ line: row.line, title: row.title, count: tracks.length })
      continue
    }
    const track = tracks[0]!
    const { fields } = row
    // The genre and subgenre, matched to the lists (a row naming ones it cannot use is not applied).
    const genrePlan = planGenre(fields, track, genres, newSubgenres)
    if (genrePlan.errors.length) {
      plan.invalid.push({ line: row.line, title: row.title, errors: genrePlan.errors })
      continue
    }
    // The fields that differ from the track, and how the preview shows them.
    const toSave: ImportUpdate['fields'] = {}
    const changes: ImportChange[] = []
    /** Notes a field that changes. */
    const change = (column: ImportChange['column'], field: keyof ImportUpdate['fields'], from: string, to: string) => {
      Object.assign(toSave, { [field]: fields[field] })
      changes.push({ column, from, to })
    }
    if (fields.composers !== undefined && fields.composers !== track.composers) change('composers', 'composers', track.composers ?? '', fields.composers)
    if (fields.album !== undefined && fields.album !== track.album) change('album', 'album', track.album ?? '', fields.album)
    if (fields.year !== undefined && fields.year !== track.year) change('year', 'year', track.year === null ? '' : String(track.year), String(fields.year))
    changes.push(...genrePlan.changes)
    if (fields.description !== undefined && !sameText(track.description, fields.description)) change('description', 'description', preview(track.description ?? ''), preview(fields.description))
    if (fields.sunoPrompt !== undefined && !sameText(track.sunoPrompt, fields.sunoPrompt)) change('suno_prompt', 'sunoPrompt', preview(track.sunoPrompt ?? ''), preview(fields.sunoPrompt))
    if (fields.lyrics !== undefined && !sameText(track.lyrics, fields.lyrics)) {
      const from = track.lyrics ? lineCount(track.lyrics) : ''
      const to = lineCount(fields.lyrics)
      // As many lines as before: "3 lines → 3 lines" would read as no change.
      change('lyrics', 'lyrics', from, to === from ? `${to}, edited` : to)
    }
    if (fields.mastered !== undefined && fields.mastered !== track.mastered) change('mastered', 'mastered', yesNo(track.mastered), yesNo(fields.mastered))
    if (fields.status !== undefined && fields.status !== track.status) change('status', 'status', track.status, fields.status)
    if (fields.visibility !== undefined && fields.visibility !== track.visibility) change('visibility', 'visibility', track.visibility, fields.visibility)

    if (!changes.length) {
      plan.unchanged.push({ line: row.line, title: track.title })
      continue
    }
    plan.updates.push({
      line: row.line,
      trackId: track.id,
      title: track.title,
      fields: toSave,
      ...(genrePlan.genreId ? { genreId: genrePlan.genreId } : {}),
      ...(genrePlan.subgenre ? { subgenre: genrePlan.subgenre } : {}),
      changes,
      syncedLyricsKept: toSave.lyrics !== undefined && track.hasSyncedLyrics,
    })
  }
  // The new subgenres the rows to apply need (a row adds one only once its genre and subgenre are accepted).
  plan.newSubgenres = [...newSubgenres.values()]
  // In the file's order.
  plan.updates.sort((a, b) => a.line - b.line)
  return plan
}
