import type { Database, Tables, TablesInsert, TablesUpdate } from '~~/shared/types/database.types'
import type { SharedTrack, SyncedLyricLine, TrackDetail, TrackSummary } from '~~/shared/types/track'
import type { TrackCreate, TrackUpdate } from '~~/shared/schemas/track'
import { trackCoverUrl } from './cover-urls'

/**
 * Conversion between database rows (snake_case) and domain types (camelCase).
 * Pure functions: no network or database access.
 *
 * Cover URLs: the owner's library gets stable, versioned app addresses
 * (/api/covers/..., see cover-urls.ts) that browsers cache; public pages get
 * signed Storage URLs computed by the sharing service and passed in.
 *
 * Row types come from shared/types/database.types.ts, generated from the
 * schema with `pnpm db:types`.
 */

export type TrackRow = Tables<'tracks'>

/** Columns read for the library (no lyrics, peaks or descriptions). */
export const TRACK_SUMMARY_COLUMNS = [
  'id', 'title', 'composers', 'album', 'year', 'genre_id', 'mastered', 'visibility', 'status',
  'duration_seconds', 'has_lyrics', 'has_synced_lyrics', 'cover_path', 'created_at', 'updated_at',
].join(',')

/** The columns listed in TRACK_SUMMARY_COLUMNS (keep the two in sync). */
export type TrackSummaryRow = Pick<TrackRow,
  | 'id' | 'title' | 'composers' | 'album' | 'year' | 'genre_id' | 'mastered' | 'visibility' | 'status'
  | 'duration_seconds' | 'has_lyrics' | 'has_synced_lyrics' | 'cover_path' | 'created_at' | 'updated_at'
>

/** Summary row → library item (camelCase); the cover URL is the cacheable app address. */
export function toTrackSummary(row: TrackSummaryRow): TrackSummary {
  return {
    id: row.id,
    title: row.title,
    composers: row.composers,
    album: row.album,
    year: row.year,
    genreId: row.genre_id,
    mastered: row.mastered,
    visibility: row.visibility,
    status: row.status,
    durationSeconds: row.duration_seconds,
    // Generated columns are typed as nullable by the generator; they never are.
    hasLyrics: row.has_lyrics ?? false,
    hasSyncedLyrics: row.has_synced_lyrics ?? false,
    // Stable, cacheable address (see cover-urls.ts); null when the track has no cover.
    coverUrl: row.cover_path ? trackCoverUrl(row.id, row.updated_at) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** Full row → owner's view (editor and player). */
export function toTrackDetail(row: TrackRow): TrackDetail {
  return {
    ...toTrackSummary(row),
    description: row.description,
    sunoPrompt: row.suno_prompt,
    lyrics: row.lyrics,
    // jsonb columns are typed as generic JSON: their shape is guaranteed by the API schemas.
    lyricsSynced: (row.lyrics_synced as SyncedLyricLine[] | null) ?? null,
    peaks: (row.peaks as number[] | null) ?? null,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    audioPath: row.audio_path,
    coverPath: row.cover_path,
  }
}

/** Row returned by the get_shared_track() database function. */
export type SharedTrackRow = Database['public']['Functions']['get_shared_track']['Returns'][number]

/**
 * Public view of a shared track: only the fields that are meant to be shared.
 * The row has no Suno prompt or mastering status to begin with (the SQL
 * function never selects them); storage paths are dropped here.
 */
export function toSharedTrack(row: SharedTrackRow, coverUrl: string | null): SharedTrack {
  return {
    id: row.id,
    title: row.title,
    // The generator types function results as non-null: normalize to null anyway.
    composers: row.composers ?? null,
    album: row.album ?? null,
    year: row.year ?? null,
    genre: row.genre ?? null,
    description: row.description ?? null,
    lyrics: row.lyrics ?? null,
    lyricsSynced: (row.lyrics_synced as SyncedLyricLine[] | null) ?? null,
    peaks: (row.peaks as number[] | null) ?? null,
    durationSeconds: row.duration_seconds ?? null,
    // Shown as "Work in progress" on the public page.
    status: row.status ?? 'final',
    coverUrl,
    // The database function never returns private tracks.
    visibility: row.visibility === 'public' ? 'public' : 'unlisted',
    updatedAt: row.updated_at,
  }
}

/** Validated create body → insert row. Missing optional fields get explicit defaults. */
export function toTrackInsert(userId: string, input: TrackCreate): TablesInsert<'tracks'> {
  return {
    id: input.id,
    user_id: userId,
    title: input.title,
    composers: input.composers ?? null,
    genre_id: input.genreId ?? null,
    year: input.year ?? null,
    album: input.album ?? null,
    description: input.description ?? null,
    suno_prompt: input.sunoPrompt ?? null,
    mastered: input.mastered ?? false,
    visibility: input.visibility ?? 'private',
    // Not sent by the upload: the database default ('draft') applies.
    ...(input.status ? { status: input.status } : {}),
    lyrics: input.lyrics ?? null,
    lyrics_synced: input.lyricsSynced ?? null,
    audio_path: input.audioPath,
    cover_path: input.coverPath ?? null,
    mime_type: input.mimeType,
    size_bytes: input.sizeBytes,
    duration_seconds: input.durationSeconds ?? null,
    peaks: input.peaks ?? null,
  }
}

/**
 * Only the fields present in the input end up in the UPDATE.
 * `undefined` = "not sent, leave it"; `null` = "clear it". The map is typed
 * against TrackUpdate, so adding a field to the schema without mapping it
 * is a compile error.
 */
export function toTrackUpdate(input: TrackUpdate): TablesUpdate<'tracks'> {
  // Field → column; typed so a new schema field without a column fails to compile.
  const map: Record<keyof TrackUpdate, keyof TablesUpdate<'tracks'>> = {
    title: 'title',
    composers: 'composers',
    genreId: 'genre_id',
    year: 'year',
    album: 'album',
    description: 'description',
    sunoPrompt: 'suno_prompt',
    mastered: 'mastered',
    visibility: 'visibility',
    status: 'status',
    lyrics: 'lyrics',
    lyricsSynced: 'lyrics_synced',
    coverPath: 'cover_path',
  }
  // Only fields actually sent (not undefined) are copied.
  const patch: Record<string, unknown> = {}
  for (const [key, column] of Object.entries(map) as [keyof TrackUpdate, string][]) {
    if (input[key] !== undefined) patch[column] = input[key]
  }
  return patch as TablesUpdate<'tracks'>
}
