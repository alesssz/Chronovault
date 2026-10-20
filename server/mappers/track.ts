import type { Tables, TablesInsert, TablesUpdate } from '~~/shared/types/database.types'
import type { SyncedLyricLine, TrackDetail, TrackSummary } from '~~/shared/types/track'
import type { TrackCreate, TrackUpdate } from '~~/shared/schemas/track'

/**
 * Conversion between database rows (snake_case) and domain types (camelCase).
 * Pure functions: no network or database access.
 */

export type TrackRow = Tables<'tracks'>

/** Columns read for the library (no lyrics, peaks or descriptions). */
export const TRACK_SUMMARY_COLUMNS = [
  'id', 'title', 'composers', 'album', 'year', 'genre_id', 'mastered', 'visibility',
  'duration_seconds', 'has_lyrics', 'has_synced_lyrics', 'cover_path', 'created_at', 'updated_at',
].join(',')

export type TrackSummaryRow = Pick<TrackRow,
  | 'id' | 'title' | 'composers' | 'album' | 'year' | 'genre_id' | 'mastered' | 'visibility'
  | 'duration_seconds' | 'has_lyrics' | 'has_synced_lyrics' | 'cover_path' | 'created_at' | 'updated_at'
>

export function toTrackSummary(row: TrackSummaryRow, coverUrl: string | null): TrackSummary {
  return {
    id: row.id,
    title: row.title,
    composers: row.composers,
    album: row.album,
    year: row.year,
    genreId: row.genre_id,
    mastered: row.mastered,
    visibility: row.visibility,
    durationSeconds: row.duration_seconds,
    hasLyrics: row.has_lyrics ?? false,
    hasSyncedLyrics: row.has_synced_lyrics ?? false,
    coverUrl,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function toTrackDetail(row: TrackRow, coverUrl: string | null): TrackDetail {
  return {
    ...toTrackSummary(row, coverUrl),
    description: row.description,
    sunoPrompt: row.suno_prompt,
    lyrics: row.lyrics,
    lyricsSynced: (row.lyrics_synced as SyncedLyricLine[] | null) ?? null,
    peaks: (row.peaks as number[] | null) ?? null,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    audioPath: row.audio_path,
    coverPath: row.cover_path,
  }
}

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

/** Only the fields present in the input end up in the UPDATE. */
export function toTrackUpdate(input: TrackUpdate): TablesUpdate<'tracks'> {
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
    lyrics: 'lyrics',
    lyricsSynced: 'lyrics_synced',
    coverPath: 'cover_path',
  }
  const patch: Record<string, unknown> = {}
  for (const [key, column] of Object.entries(map) as [keyof TrackUpdate, string][]) {
    if (input[key] !== undefined) patch[column] = input[key]
  }
  return patch as TablesUpdate<'tracks'>
}
