import { getSharedPlaylistPlaybackSource } from '../../../../../../services/sharing.service'

/** GET /api/shared/playlists/:id/tracks/:trackId/playback — signed streaming URL of a track in a shared playlist. */
export default defineEventHandler(async (event) => {
  return getSharedPlaylistPlaybackSource(
    await visitorClient(event),
    useAudioStorage(),
    requireUuidParam(event),
    requireUuidParam(event, 'trackId'),
  )
})
