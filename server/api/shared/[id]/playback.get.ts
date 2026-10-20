import { getSharedPlaybackSource } from '../../../services/sharing.service'

/** GET /api/shared/:id/playback — time-limited signed URL to stream a shared track. */
export default defineEventHandler(async (event) => {
  return getSharedPlaybackSource(await visitorClient(event), useAudioStorage(), requireUuidParam(event))
})
