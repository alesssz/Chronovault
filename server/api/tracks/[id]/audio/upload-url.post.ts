import { audioReplaceUploadSchema } from '~~/shared/schemas/track'
import { createReplaceTarget } from '../../../../services/tracks.service'

/**
 * POST /api/tracks/:id/audio/upload-url — presigned URL to upload the file
 * that will replace a track's audio (Replace audio in the editor), straight
 * to the audio storage (Cloudflare R2).
 * The key is `<userId>/<trackId>.<revision>.<ext>`, built by the server next
 * to the current file, which stays in use until PUT /api/tracks/:id/audio.
 * Auth: signed-in user (401 otherwise); only the user's own items are reachable.
 * Body: audioReplaceUploadSchema (extension, MIME type, size ≤ 500 MB).
 * 200 → AudioUploadTarget (PUT URL valid for 1 hour); 400 invalid or too large; 404.
 */
export default defineEventHandler(async (event) => {
  const { db, userId } = await requireAuth(event)
  const trackId = requireUuidParam(event)
  const request = await readValidated(event, audioReplaceUploadSchema)
  return createReplaceTarget(db, useAudioStorage(), userId, trackId, request)
})
