import { audioUploadRequestSchema } from '~~/shared/schemas/track'
import { createUploadTarget } from '../../services/tracks.service'

/**
 * POST /api/tracks/upload-url — presigned URL to upload an audio file straight
 * to the audio storage (Cloudflare R2), inside the user's folder.
 * Auth: signed-in user (401 otherwise); only the user's own items are reachable.
 * Body: audioUploadRequestSchema (track id, extension, MIME type, size ≤ 500 MB).
 * 200 → AudioUploadTarget (PUT URL valid for 1 hour); 400 invalid or too large.
 */
export default defineEventHandler(async (event) => {
  // The signed-in user (401 without a session).
  const { userId } = await requireAuth(event)
  // The request body, validated against the schema (400 otherwise).
  const request = await readValidated(event, audioUploadRequestSchema)
  return createUploadTarget(useAudioStorage(), userId, request)
})
