import { z } from 'zod'
import { TRACK_VISIBILITIES } from '../types/track'
import { optionalText, storagePath } from './track'

/**
 * Playlist validation schemas, shared by the playlist page form and the
 * `/api/playlists` routes. Limits mirror the `playlists` table constraints.
 */

/** Most tracks in a playlist. */
export const MAX_PLAYLIST_TRACKS = 1000

/**
 * An ordered list of distinct track ids. Duplicates are rejected here,
 * because the database key (playlist_id, track_id) would refuse them with a
 * less helpful error. Ownership of the tracks is enforced by RLS.
 */
const trackIds = z
  .array(z.uuid())
  .max(MAX_PLAYLIST_TRACKS, `At most ${MAX_PLAYLIST_TRACKS} tracks`)
  .refine(ids => new Set(ids).size === ids.length, 'A track can appear only once')

/** Every editable field of a playlist (playlist page form). */
export const playlistMetadataSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200, 'At most 200 characters'),
  description: optionalText(5000),
  visibility: z.enum(TRACK_VISIBILITIES),
})

export type PlaylistMetadataInput = z.input<typeof playlistMetadataSchema>
export type PlaylistMetadata = z.output<typeof playlistMetadataSchema>

/** Body of POST /api/playlists: a title, and optionally the first tracks. */
export const playlistCreateSchema = playlistMetadataSchema.partial().extend({
  title: playlistMetadataSchema.shape.title,
  trackIds: trackIds.optional(),
})

export type PlaylistCreateInput = z.input<typeof playlistCreateSchema>
export type PlaylistCreate = z.output<typeof playlistCreateSchema>

/** Body of PATCH /api/playlists/:id: any subset of the metadata, or the cover (`null` removes it). */
export const playlistUpdateSchema = playlistMetadataSchema
  .partial()
  .extend({ coverPath: storagePath.nullable().optional() })
  .refine(data => Object.keys(data).length > 0, 'Nothing to update')

export type PlaylistUpdateInput = z.input<typeof playlistUpdateSchema>
export type PlaylistUpdate = z.output<typeof playlistUpdateSchema>

/**
 * Body of PUT /api/playlists/:id/tracks (the whole list, in order: reorder
 * and remove) and of POST /api/playlists/:id/tracks (tracks to append).
 */
export const playlistTracksSchema = z.object({ trackIds })

export type PlaylistTracks = z.output<typeof playlistTracksSchema>
