/**
 * Track domain types shared by client and server (camelCase).
 *
 * The database uses snake_case: conversion happens in the server mappers
 * (server/mappers/track.ts). The API returns exactly these shapes, and the
 * typed client (app/services/api.ts) declares them as response types.
 *
 * Which type is used where:
 *   TrackSummary  → library list, playlists, player queue
 *   TrackDetail   → edit page and the track being played (owner only)
 *   SharedTrack   → public track page /t/:id (anyone with the link)
 *   SharedTrackContent → tracks of a shared playlist /p/:id
 */

/** Possible visibilities, in the order shown by the UI (also the Postgres enum `track_visibility`). */
export const TRACK_VISIBILITIES = ['private', 'unlisted', 'public'] as const
/**
 * - `private`: only the owner;
 * - `unlisted`: anyone with the link, kept out of search engines;
 * - `public`: anyone with the link, may be indexed. There is no public catalog.
 */
export type TrackVisibility = (typeof TRACK_VISIBILITIES)[number]

/**
 * A synced lyric line: `time` in seconds from the start of the track.
 * Section headers (`[Verse 1]`, `[Chorus]`…) have `section: true` and the
 * time of the line they introduce.
 */
export interface SyncedLyricLine {
  time: number
  text: string
  section?: boolean
}

/** A genre as the API returns it. */
export interface Genre {
  id: string
  name: string
  /** true when created by the user, false for built-in genres. */
  custom: boolean
}

/** Lightweight data for lists and the library (no lyrics, peaks or long texts). */
export interface TrackSummary {
  id: string
  title: string
  composers: string | null
  album: string | null
  year: number | null
  genreId: string | null
  mastered: boolean
  visibility: TrackVisibility
  /** Measured in the browser at upload time; null when the file could not be decoded. */
  durationSeconds: number | null
  /** Generated columns: the library shows lyrics badges without loading the lyrics. */
  hasLyrics: boolean
  hasSyncedLyrics: boolean
  /**
   * Cover address, or null when the track has none: /api/covers/tracks/:id?v=…
   * (stable, cached by the browser for a year; `v` changes with the track).
   */
  coverUrl: string | null
  /** ISO 8601 timestamps. */
  createdAt: string
  updatedAt: string
}

/** Full track data (editor and player). Only ever returned to the owner. */
export interface TrackDetail extends TrackSummary {
  description: string | null
  /** The prompt used to generate the track on Suno: private, never shared. */
  sunoPrompt: string | null
  /** Plain lyrics, section headers included (`[Verse 1]` on their own line). */
  lyrics: string | null
  lyricsSynced: SyncedLyricLine[] | null
  /** Waveform amplitudes 0..1 (see shared/utils/peaks.ts). */
  peaks: number[] | null
  mimeType: string
  sizeBytes: number
  /** Storage keys: owner-only, used by the editor (cover upload) and the server. */
  audioPath: string
  coverPath: string | null
}

/**
 * What anyone with the link sees of an 'unlisted' or 'public' track
 * (the public share page). Never includes the Suno prompt, the mastering
 * status or storage paths.
 */
export interface SharedTrack extends SharedTrackContent {
  visibility: Exclude<TrackVisibility, 'private'>
}

/** Shareable fields of a track (also used for the tracks of a shared playlist). */
export interface SharedTrackContent {
  id: string
  title: string
  composers: string | null
  album: string | null
  year: number | null
  /** Genre name (the genre itself may be one of the owner's custom genres). */
  genre: string | null
  description: string | null
  lyrics: string | null
  lyricsSynced: SyncedLyricLine[] | null
  peaks: number[] | null
  durationSeconds: number | null
  /** Signed Storage URL (6 h) of the cover: visitors have no session for /api/covers. */
  coverUrl: string | null
  updatedAt: string
}

/**
 * A time-limited URL to stream a track (presigned GET on Cloudflare R2).
 * The player refreshes it before `expiresAt` when needed (app/stores/player.ts).
 */
export interface PlaybackSource {
  url: string
  /** ISO 8601 expiry (6 hours after signing). */
  expiresAt: string
}

/** Where the client uploads an audio file: a presigned PUT URL on the audio storage. */
export interface AudioUploadTarget {
  uploadUrl: string
  /** Storage key to send back to POST /api/tracks. */
  audioPath: string
  /** The upload must start before this time (1 hour). */
  expiresAt: string
}
