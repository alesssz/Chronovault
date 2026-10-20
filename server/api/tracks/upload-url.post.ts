import { audioUploadRequestSchema } from '~~/shared/schemas/track'
import { createUploadTarget } from '../../services/tracks.service'

/**
 * POST /api/tracks/upload-url — presigned URL to upload an audio file straight
 * to the audio storage (Cloudflare R2), inside the user's folder.
 */
export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const request = await readValidated(event, audioUploadRequestSchema)
  return createUploadTarget(useAudioStorage(), userId, request)
})
