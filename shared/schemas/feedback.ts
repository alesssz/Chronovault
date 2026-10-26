import { z } from 'zod'
import { optionalText } from './track'

/**
 * Validation schemas of the listeners' feedback: plays counted by the
 * player, and the votes on groups of versions. Shared by the public pages
 * and the routes that receive them. Limits mirror the `version_votes` table
 * constraints (supabase/migrations/…_plays_and_votes.sql).
 */

/** Longest name a voter can leave. */
export const MAX_VOTER_NAME = 60
/** Longest comment a voter can leave. */
export const MAX_VOTE_COMMENT = 1000
/**
 * Most votes a group of versions takes; past it a new voter gets 429
 * (cast_version_vote, …_anonymous_write_caps.sql, which holds the real cap).
 */
export const MAX_GROUP_VOTES = 50

/**
 * Body of POST /api/plays. The player sends it once a track has really been
 * listened to, and again with `completed` once it is (almost) over.
 */
export const playRecordSchema = z.object({
  trackId: z.uuid(),
  /** The shared playlist or group the track is heard through; null on a track page or in the library. */
  playlistId: z.uuid().nullable().default(null),
  /** This browser's random id (app/lib/listener-id.ts); the server ignores it for the owner. */
  listenerId: z.uuid(),
  completed: z.boolean().default(false),
})

/** Body a client sends to POST /api/plays. */
export type PlayRecordInput = z.input<typeof playRecordSchema>
/** Validated play, as the service receives it. */
export type PlayRecord = z.output<typeof playRecordSchema>

/**
 * Body of PUT /api/shared/playlists/:id/vote: the visitor's pick, with an
 * optional name and comment (empty texts become null).
 */
export const versionVoteSchema = z.object({
  voterId: z.uuid(),
  trackId: z.uuid(),
  // Both may be left out: a pick alone is a vote.
  name: optionalText(MAX_VOTER_NAME).default(null),
  comment: optionalText(MAX_VOTE_COMMENT).default(null),
})

/** What the vote form holds before validation. */
export type VersionVoteInput = z.input<typeof versionVoteSchema>
/** Validated vote. */
export type VersionVote = z.output<typeof versionVoteSchema>

/**
 * Body of POST /api/playlists/:id/feedback/seen: up to when the owner saw
 * the group's feedback (the `asOf` of the copy on their screen); now when
 * left out. The server never stores a time in the future, nor moves the
 * last visit back.
 */
export const feedbackSeenSchema = z.object({
  at: z.iso.datetime({ offset: true }).optional(),
}).default({})

/** Body a client sends to POST /api/playlists/:id/feedback/seen. */
export type FeedbackSeenInput = z.input<typeof feedbackSeenSchema>

/** Query of GET and DELETE /api/shared/playlists/:id/vote: whose pick. */
export const voterQuerySchema = z.object({
  voter: z.uuid(),
})
