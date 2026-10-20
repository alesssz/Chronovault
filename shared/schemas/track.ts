import { z } from 'zod'
import { TRACK_VISIBILITIES } from '../types/track'
import { AUDIO_EXTENSIONS, MAX_AUDIO_BYTES } from '../utils/audio-files'
import { PEAKS_RESOLUTION } from '../utils/peaks'

/**
 * Shared validation schemas: the client form (UForm) uses them and the
 * server reuses them to validate request bodies.
 */

/** Optional text: empty string → null. */
const optionalText = (max: number) =>
  z.string().trim().max(max, `At most ${max} characters`).transform(v => (v === '' ? null : v)).nullable()

const storagePath = z.string().min(3).max(300)

export const syncedLyricLineSchema = z.object({
  time: z.number().min(0).max(86_400),
  text: z.string().max(500),
  section: z.boolean().optional(),
})

export const trackMetadataSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200, 'At most 200 characters'),
  composers: optionalText(300),
  genreId: z.uuid().nullable(),
  year: z.number().int().min(1000, 'Invalid year').max(9999, 'Invalid year').nullable(),
  album: optionalText(200),
  description: optionalText(5000),
  sunoPrompt: optionalText(5000),
  mastered: z.boolean(),
  visibility: z.enum(TRACK_VISIBILITIES),
  lyrics: optionalText(20_000),
  lyricsSynced: z.array(syncedLyricLineSchema).max(2000).nullable(),
})

export type TrackMetadataInput = z.input<typeof trackMetadataSchema>
export type TrackMetadata = z.output<typeof trackMetadataSchema>

const audioMimeType = z.string().regex(/^audio\/[\w.+-]+$/, 'Invalid audio format')

/** Body of POST /api/tracks/upload-url: the file the client is about to upload. */
export const audioUploadRequestSchema = z.object({
  trackId: z.uuid(),
  extension: z.enum(Object.keys(AUDIO_EXTENSIONS) as [string, ...string[]]),
  mimeType: audioMimeType,
  sizeBytes: z.number().int().positive().max(MAX_AUDIO_BYTES, 'File too large'),
})

export type AudioUploadRequest = z.output<typeof audioUploadRequestSchema>

/** Body of POST /api/tracks: technical file data + initial metadata. */
export const trackCreateSchema = trackMetadataSchema.partial().extend({
  id: z.uuid(),
  title: trackMetadataSchema.shape.title,
  audioPath: storagePath,
  coverPath: storagePath.nullable().optional(),
  mimeType: audioMimeType,
  sizeBytes: z.number().int().positive().max(MAX_AUDIO_BYTES),
  durationSeconds: z.number().min(0).nullable().optional(),
  peaks: z.array(z.number().min(0).max(1)).max(PEAKS_RESOLUTION).nullable().optional(),
})

export type TrackCreateInput = z.input<typeof trackCreateSchema>
export type TrackCreate = z.output<typeof trackCreateSchema>

/** Body of PATCH /api/tracks/:id: any subset of the metadata. */
export const trackUpdateSchema = trackMetadataSchema
  .partial()
  .extend({ coverPath: storagePath.nullable().optional() })
  .refine(data => Object.keys(data).length > 0, 'Nothing to update')

export type TrackUpdateInput = z.input<typeof trackUpdateSchema>
export type TrackUpdate = z.output<typeof trackUpdateSchema>

export const genreCreateSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(60, 'At most 60 characters'),
})

export type GenreCreate = z.output<typeof genreCreateSchema>
