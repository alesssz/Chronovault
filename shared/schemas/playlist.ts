import { z } from 'zod'
import { TRACK_VISIBILITIES } from '../types/track'
import { PLAYLIST_PURPOSES } from '../types/playlist'
import { optionalText, patchSchemaOf, safeText } from './track'

/**
 * Playlist validation schemas, shared by the playlist page form and the
 * `/api/playlists` routes. Limits mirror the `playlists` table constraints.
 */

/**
 * Most tracks in a playlist. Checked here first, with a readable message; the
 * database holds the same limit for every write to playlist_tracks, the app's
 * and direct ones alike (trigger in …_playlist_track_rules.sql).
 */
export const MAX_PLAYLIST_TRACKS = 1000

/**
 * An ordered list of distinct track ids. Duplicates are rejected here,
 * because the database key (playlist_id, track_id) would refuse them with a
 * less helpful error. Ownership of the tracks is enforced by the database
 * functions that write the list ("not found", 404, for someone else's).
 */
const trackIds = z
  .array(z.uuid())
  .max(MAX_PLAYLIST_TRACKS, `At most ${MAX_PLAYLIST_TRACKS} tracks`)
  .refine(ids => new Set(ids).size === ids.length, 'A track can appear only once')

/** Every editable field of a playlist (playlist page form). */
export const playlistMetadataSchema = z.object({
  title: safeText().trim().min(1, 'Title is required').max(200, 'At most 200 characters'),
  description: optionalText(5000),
  visibility: z.enum(TRACK_VISIBILITIES),
})

/** What the playlist form holds before validation. */
export type PlaylistMetadataInput = z.input<typeof playlistMetadataSchema>
/** Validated playlist metadata. */
export type PlaylistMetadata = z.output<typeof playlistMetadataSchema>

/**
 * Body of POST /api/playlists: a title, and optionally the first tracks and
 * the purpose ('playlist' when omitted; "Share for feedback" sends 'versions').
 * The purpose is fixed at creation: PATCH cannot change it.
 */
export const playlistCreateSchema = playlistMetadataSchema.partial().extend({
  title: playlistMetadataSchema.shape.title,
  purpose: z.enum(PLAYLIST_PURPOSES).optional(),
  trackIds: trackIds.optional(),
})

/** Body a client sends to POST /api/playlists. */
export type PlaylistCreateInput = z.input<typeof playlistCreateSchema>
/** Validated create body, as the service receives it. */
export type PlaylistCreate = z.output<typeof playlistCreateSchema>

/** Body of PATCH /api/playlists/:id: any subset of the metadata, or the cover (`null` removes it). */
export const playlistUpdateSchema = patchSchemaOf(playlistMetadataSchema)

/** Body a client sends to PATCH /api/playlists/:id. */
export type PlaylistUpdateInput = z.input<typeof playlistUpdateSchema>
/** Validated PATCH body. */
export type PlaylistUpdate = z.output<typeof playlistUpdateSchema>

/** Query of GET /api/playlists: which purpose to list (default 'playlist'). */
export const playlistListQuerySchema = z.object({
  purpose: z.enum(PLAYLIST_PURPOSES).default('playlist'),
})

/** Validated query of GET /api/playlists. */
export type PlaylistListQuery = z.output<typeof playlistListQuerySchema>

/**
 * Body of PUT /api/playlists/:id/tracks (the whole list, in order: reorder
 * and remove) and of POST /api/playlists/:id/tracks (tracks to append).
 */
export const playlistTracksSchema = z.object({ trackIds })

/** Validated `{ trackIds }` body of PUT/POST /api/playlists/:id/tracks. */
export type PlaylistTracks = z.output<typeof playlistTracksSchema>
