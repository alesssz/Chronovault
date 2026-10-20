/**
 * Domain types shared by client and server (camelCase).
 * The database uses snake_case: conversion happens in the server mappers.
 */

export const TRACK_VISIBILITIES = ['private', 'unlisted', 'public'] as const
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

export interface Genre {
  id: string
  name: string
  /** true when created by the user, false for built-in genres. */
  custom: boolean
}

/** Lightweight data for lists and the library. */
export interface TrackSummary {
  id: string
  title: string
  composers: string | null
  album: string | null
  year: number | null
  genreId: string | null
  mastered: boolean
  visibility: TrackVisibility
  durationSeconds: number | null
  hasLyrics: boolean
  hasSyncedLyrics: boolean
  coverUrl: string | null
  createdAt: string
  updatedAt: string
}

/** Full track data (editor and player). */
export interface TrackDetail extends TrackSummary {
  description: string | null
  sunoPrompt: string | null
  lyrics: string | null
  lyricsSynced: SyncedLyricLine[] | null
  peaks: number[] | null
  mimeType: string
  sizeBytes: number
  audioPath: string
  coverPath: string | null
}

/**
 * What anyone with the link sees of an 'unlisted' or 'public' track
 * (the public share page). Never includes the Suno prompt, the mastering
 * status or storage paths.
 */
export interface SharedTrack {
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
  coverUrl: string | null
  visibility: Exclude<TrackVisibility, 'private'>
  updatedAt: string
}

export interface PlaybackSource {
  url: string
  expiresAt: string
}

/** Where the client uploads an audio file: a presigned PUT URL on the audio storage. */
export interface AudioUploadTarget {
  uploadUrl: string
  /** Storage key to send back to POST /api/tracks. */
  audioPath: string
  expiresAt: string
}
