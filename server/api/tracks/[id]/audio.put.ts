import { audioReplaceSchema } from '~~/shared/schemas/track'
import { replaceTrackAudio } from '../../../services/tracks.service'

/**
 * PUT /api/tracks/:id/audio — moves a track to the audio file the client has
 * just uploaded (POST /api/tracks/:id/audio/upload-url), keeping everything
 * else: metadata, lyrics, cover, plays, votes, playlists, share links. Synced
 * lyrics are kept and flagged for checking (`syncNeedsReview`). The old file
 * is deleted.
 * Auth: signed-in user (401 otherwise); only the user's own items are reachable.
 * Body: audioReplaceSchema. 200 → TrackDetail; 400 invalid body, a path that is
 * not a replacement of this track, file missing or of a different size (the
 * file is then deleted); 404; 409 another replace moved the track first (this
 * file is deleted).
 */
export default defineEventHandler(async (event) => {
  const { db, userId } = await requireAuth(event)
  const trackId = requireUuidParam(event)
  const input = await readValidated(event, audioReplaceSchema)
  return replaceTrackAudio(db, useAudioStorage(), userId, trackId, input)
})
