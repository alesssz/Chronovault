import { audioReplaceUploadSchema } from '~~/shared/schemas/track'
import { createReplaceTarget } from '../../../../services/tracks.service'

/**
 * POST /api/tracks/:id/audio/upload-url — presigned URL to upload the file
 * that will replace a track's audio (Replace audio in the editor, see
 * docs/07-data-flows.md 7.19), straight to the audio storage (Cloudflare R2).
 * The key is `<userId>/<trackId>.<revision>.<ext>`, built by the server next
 * to the current file, which stays in use until PUT /api/tracks/:id/audio.
 * Auth: signed-in user (401 otherwise); only the user's own items are reachable.
 * Body: audioReplaceUploadSchema (extension, MIME type, size ≤ 500 MB).
 * 200 → AudioUploadTarget (PUT URL valid for 1 hour); 400 invalid or too large; 404.
 */
export default defineEventHandler(async (event) => {
  // The signed-in user, and a database client acting as them (checks the track is theirs); 401 without a session.
  const { db, userId } = await requireAuth(event)
  // The track's id in the address (400 when it is not a UUID).
  const trackId = requireUuidParam(event)
  // The request body, validated against the schema (400 otherwise).
  const request = await readValidated(event, audioReplaceUploadSchema)
  return createReplaceTarget(db, useAudioStorage(), userId, trackId, request)
})
