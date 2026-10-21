import { getSharedPlaylistPlaybackSource } from '../../../../../../services/sharing.service'

/**
 * GET /api/shared/playlists/:id/tracks/:trackId/playback — signed streaming URL
 * of a track in a shared playlist. 404 unless the track belongs to that playlist.
 * Auth: none (public). Private or missing items answer 404 alike.
 * 200 → PlaybackSource (6 hours).
 */
export default defineEventHandler(async (event) => {
  return getSharedPlaylistPlaybackSource(
    await visitorClient(event),
    useAudioStorage(),
    requireUuidParam(event),
    requireUuidParam(event, 'trackId'),
  )
})
