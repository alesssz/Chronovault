import { audioUploadRequestSchema } from '~~/shared/schemas/track'
import { createUploadTarget } from '../../services/tracks.service'

/**
 * POST /api/tracks/upload-url — presigned URL to upload an audio file straight
 * to the audio storage (Cloudflare R2), inside the user's folder.
 * Auth: signed-in user (401 otherwise); only the user's own items are reachable.
 * Body: audioUploadRequestSchema (track id, extension, MIME type, size ≤ 500 MB).
 * 200 → AudioUploadTarget (PUT URL valid for 1 hour); 400 invalid or too large;
 * 409 the track id is already registered (its file is never overwritten).
 */
export default defineEventHandler(async (event) => {
  // The signed-in user, and a database client acting as them (checks the id is not taken); 401 without a session.
  const { db, userId } = await requireAuth(event)
  // The request body, validated against the schema (400 otherwise).
  const request = await readValidated(event, audioUploadRequestSchema)
  return createUploadTarget(db, useAudioStorage(), userId, request)
})
