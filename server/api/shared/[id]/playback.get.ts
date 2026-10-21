import { getSharedPlaybackSource } from '../../../services/sharing.service'

/**
 * GET /api/shared/:id/playback — time-limited signed URL to stream a shared track.
 * Auth: none (public). Private or missing items answer 404 alike.
 * 200 → PlaybackSource (6 hours); 404.
 */
export default defineEventHandler(async (event) => {
  return getSharedPlaybackSource(await visitorClient(event), useAudioStorage(), requireUuidParam(event))
})
