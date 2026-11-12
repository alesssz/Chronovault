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

/** Possible statuses (also the Postgres enum `track_status`). */
export const TRACK_STATUSES = ['draft', 'final'] as const
/**
 * - `draft`: a work in progress, e.g. one of several versions sent to friends
 *   to pick the best; new uploads start here. Share pages say "Work in progress".
 * - `final`: the chosen, finished version.
 */
export type TrackStatus = (typeof TRACK_STATUSES)[number]

/**
 * A synced lyric line: `time` in seconds from the start of the track.
 * Section headers (`[Verse 1]`, `[Chorus]`…) have `section: true` and the
 * time of the line they introduce.
 */
export interface SyncedLyricLine {
  /** When the line starts, in seconds from the start of the track (centisecond precision, as in LRC). */
  time: number
  /** The line as sung (or the header's name, e.g. "[Chorus]"). */
  text: string
  /** A section header rather than a sung line: shown as a title, never highlighted as "now". */
  section?: boolean
}

/**
 * A main genre as the API returns it: one of a fixed list (nobody adds one),
 * with its subgenres, the built-in ones and the user's own.
 */
export interface Genre {
  /** Row id (uuid), what tracks store in `genreId`. */
  id: string
  /** The name shown in the filters and the editor. */
  name: string
  /** Its subgenres, built-in and the user's own, sorted by name. */
  subgenres: Subgenre[]
}

/** A subgenre: under one genre, built-in or created by the user (coherent with its genre). */
export interface Subgenre {
  /** Row id (uuid), what tracks store in `subgenreId`. */
  id: string
  /** The genre it belongs to. */
  genreId: string
  /** The name shown in the editor and, outside it, in place of the genre's (the most specific). */
  name: string
  /** true when created by the user, false for built-in subgenres. */
  custom: boolean
}

/** Lightweight data for lists and the library (no lyrics, peaks or long texts). */
export interface TrackSummary {
  /** Row id (uuid); also the file name of its audio and cover in storage. */
  id: string
  /** The track's title (required, trimmed). */
  title: string
  /** Who wrote it, as free text ("Chronovault, Ada"); written as artist and composer in downloads. */
  composers: string | null
  /** Album name, free text. */
  album: string | null
  /** Year of release or creation. */
  year: number | null
  /** The genre (one of the fixed list), or none. */
  genreId: string | null
  /** A subgenre of that genre (built-in or the owner's own), or none; never set without a genre. */
  subgenreId: string | null
  /** The owner marked it as mastered (a private note: never shared). */
  mastered: boolean
  /** Who may open its share page (see TrackVisibility). */
  visibility: TrackVisibility
  /** Draft (work in progress) or final version. */
  status: TrackStatus
  /** Measured in the browser at upload time; null when the file could not be decoded. */
  durationSeconds: number | null
  /** Generated column: the track has lyrics (plain or synced), so the library shows the badge without loading them. */
  hasLyrics: boolean
  /** Generated column: the lyrics are synced line by line (the "synced" badge). */
  hasSyncedLyrics: boolean
  /**
   * The audio was replaced after the lyrics were synced, and the owner has not
   * checked the sync since: the times may be off (a master can trim or shift
   * the audio). The library's synced-lyrics icon turns to a warning colour and
   * the editor's Sync tab says so (docs/07-data-flows.md 7.19).
   */
  syncNeedsReview: boolean
  /**
   * Cover address, or null when the track has none: /api/covers/tracks/:id?v=…
   * (stable, cached by the browser for a year; `v` changes with the track).
   */
  coverUrl: string | null
  /** When it was uploaded (ISO 8601): the library's default order, newest first. */
  createdAt: string
  /** When it last changed (ISO 8601): versions the cover address. */
  updatedAt: string
}

/** Full track data (editor and player). Only ever returned to the owner. */
export interface TrackDetail extends TrackSummary {
  /** Free text about the track, shown on its share page and in the full-screen player. */
  description: string | null
  /** The prompt used to generate the track on Suno: private, never shared. */
  sunoPrompt: string | null
  /** Plain lyrics, section headers included (`[Verse 1]` on their own line). */
  lyrics: string | null
  /** The lyrics synced line by line (the sync editor's result), or none. */
  lyricsSynced: SyncedLyricLine[] | null
  /** Waveform amplitudes 0..1 (see shared/utils/peaks.ts). */
  peaks: number[] | null
  /** The audio file's type, e.g. `audio/flac` (WAV uploads are stored as FLAC). */
  mimeType: string
  /** The audio file's size in bytes (the Storage dialog's totals, the download's progress). */
  sizeBytes: number
  /** Storage key of the audio file (`<userId>/<trackId>.<ext>`): owner-only, used by the server. */
  audioPath: string
  /** Storage key of the cover, or none: owner-only, used by the editor (cover upload) and the server. */
  coverPath: string | null
}

/**
 * Every metadata field of a track, for the metadata export and import
 * (GET /api/tracks/metadata): the library's fields plus the long texts, and
 * whether it has synced lyrics (not the lines themselves), without peaks,
 * file details or cover. Only ever returned to the owner.
 */
export type TrackMetadata = Pick<TrackDetail,
  | 'id' | 'title' | 'composers' | 'album' | 'year' | 'genreId' | 'subgenreId' | 'mastered' | 'status' | 'visibility'
  | 'description' | 'sunoPrompt' | 'lyrics' | 'hasSyncedLyrics'
>

/**
 * What anyone with the link sees of an 'unlisted' or 'public' track
 * (the public share page). Never includes the Suno prompt, the mastering
 * status or storage paths.
 */
export interface SharedTrack extends SharedTrackContent {
  /** Never 'private': a private track answers like a missing one. */
  visibility: Exclude<TrackVisibility, 'private'>
}

/** Shareable fields of a track (also used for the tracks of a shared playlist). */
export interface SharedTrackContent {
  /** Row id: the share page's address (/t/:id) and what plays are recorded against. */
  id: string
  /** The track's title. */
  title: string
  /** Who wrote it, as free text. */
  composers: string | null
  /** Album name. */
  album: string | null
  /** Year of release or creation. */
  year: number | null
  /** The most specific genre name: the subgenre's when set (maybe one of the owner's own), else the genre's. */
  genre: string | null
  /** Free text about the track. */
  description: string | null
  /** Plain lyrics, section headers included. */
  lyrics: string | null
  /** The lyrics synced line by line, or none. */
  lyricsSynced: SyncedLyricLine[] | null
  /** Waveform amplitudes 0..1, drawn before the audio loads. */
  peaks: number[] | null
  /** Length in seconds, or null when unknown. */
  durationSeconds: number | null
  /** Drafts are shown to visitors as "Work in progress". */
  status: TrackStatus
  /** Signed Storage URL (6 h) of the cover: visitors have no session for /api/covers. */
  coverUrl: string | null
  /**
   * Visitors may download it (the share pages' Download): the track itself
   * is 'unlisted', or 'private' and shared through a playlist. A 'public'
   * track never is, on its own page or inside a playlist.
   */
  downloadable: boolean
  /**
   * The stored file's extension (`flac`, `mp3`…; `''` if it has none): the
   * download's file name and tag format. The storage path itself, which
   * holds the owner's id, is never sent.
   */
  fileExtension: string
  /** When it last changed (ISO 8601). */
  updatedAt: string
}

/**
 * A time-limited URL to stream a track (presigned GET on Cloudflare R2).
 * The player refreshes it before `expiresAt` when needed (app/stores/player.ts).
 */
export interface PlaybackSource {
  /** The streaming address (/api/stream, which redirects to a presigned storage URL). */
  url: string
  /** ISO 8601 expiry (6 hours after signing). */
  expiresAt: string
}

/** Where the client uploads an audio file: a presigned PUT URL on the audio storage. */
export interface AudioUploadTarget {
  /** The presigned PUT address the browser uploads the file to, straight to storage. */
  uploadUrl: string
  /** Storage key to send back to POST /api/tracks (a new track) or PUT /api/tracks/:id/audio (a replace). */
  audioPath: string
  /** The upload must start before this time (1 hour). */
  expiresAt: string
}
