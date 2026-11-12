import { audioReplaceSchema } from '~~/shared/schemas/track'
import { replaceTrackAudio } from '../../../services/tracks.service'

/**
 * PUT /api/tracks/:id/audio — moves a track to the audio file the client has
 * just uploaded (POST /api/tracks/:id/audio/upload-url), keeping everything
 * else: metadata, lyrics, cover, plays, votes, playlists, share links. Synced
 * lyrics are kept and flagged for checking (`syncNeedsReview`). The old file
 * is deleted (docs/07-data-flows.md 7.19).
 * Auth: signed-in user (401 otherwise); only the user's own items are reachable.
 * Body: audioReplaceSchema. 200 → TrackDetail; 400 invalid body, a path that is
 * not a replacement of this track, file missing or of a different size (the
 * file is then deleted); 404; 409 another replace moved the track first (this
 * file is deleted).
 */
export default defineEventHandler(async (event) => {
  // The signed-in user, and a database client acting as them (RLS applies); 401 without a session.
  const { db, userId } = await requireAuth(event)
  // The track's id in the address (400 when it is not a UUID).
  const trackId = requireUuidParam(event)
  // The request body, validated against the schema (400 otherwise).
  const input = await readValidated(event, audioReplaceSchema)
  return replaceTrackAudio(db, useAudioStorage(), userId, trackId, input)
})
