/**
 * Playlist domain types shared by client and server (camelCase).
 * Rows are converted by server/mappers/playlist.ts.
 *
 *   PlaylistSummary → Playlists and Versions pages (cards)
 *   PlaylistDetail  → playlist or version group page (owner)
 *   SharedPlaylist  → public playlist page /p/:id (anyone with the link)
 */
import type { SharedTrackContent, TrackSummary, TrackVisibility } from './track'

/** What a playlist is for (also the Postgres enum `playlist_purpose`). */
export const PLAYLIST_PURPOSES = ['playlist', 'versions'] as const
/**
 * - `playlist`: a list the user curates (Playlists page, "Add to playlist" menus);
 * - `versions`: a group of versions of one song, made by "Share for feedback"
 *   in the library so friends can pick the best (Versions page).
 * Both are stored, shared and played the same way: only where they are
 * listed, and how the public page words them, differ.
 */
export type PlaylistPurpose = (typeof PLAYLIST_PURPOSES)[number]

/** Most covers shown in a playlist's automatic mosaic (2×2). */
export const MOSAIC_SIZE = 4

/** Lightweight playlist data for lists. */
export interface PlaylistSummary {
  /** Row id (uuid): the page address (/playlists/:id, /versions/:id, /p/:id). */
  id: string
  /** A curated playlist, or a group of versions sent for feedback. */
  purpose: PlaylistPurpose
  /** The playlist's name. */
  title: string
  /** Free text about it, shown on its page and its share page. */
  description: string | null
  /** Who may open its share page (the tracks follow the playlist, whatever their own visibility). */
  visibility: TrackVisibility
  /** Custom cover, when the owner uploaded one (/api/covers/playlists/:id?v=…, cached). */
  coverUrl: string | null
  /**
   * Cover addresses (/api/covers/tracks/…) of the first tracks that have one, for the automatic
   * mosaic (up to MOSAIC_SIZE). The UI shows a 2×2 grid only with 4 covers,
   * otherwise the first one alone (see PlaylistCover.vue).
   */
  mosaic: string[]
  /** How many tracks it holds. */
  trackCount: number
  /** Sum of the tracks' durations, in seconds. */
  durationSeconds: number
  /** When it was created (ISO 8601): the order of the cards, newest first. */
  createdAt: string
  /** When it last changed (ISO 8601): versions the cover address. */
  updatedAt: string
}

/** A playlist with its tracks, in order. */
export interface PlaylistDetail extends PlaylistSummary {
  /** Storage key of the custom cover (owner only). */
  coverPath: string | null
  /** The tracks, in playlist order. */
  tracks: TrackSummary[]
  /** How many of the tracks are private (they become audible when the playlist is shared). */
  privateTrackCount: number
}

// --- Feedback on a group of versions ------------------------------------------------
// Visitors of a shared group pick the version they prefer (table
// `version_votes`); the owner sees the votes next to the plays heard through
// the group. Voting closes once a version of the group is marked final.

/** One version of a group, with its feedback (owner's Versions page). */
export interface VersionTally {
  /** The version (a track of the group). */
  trackId: string
  /** Visitors who picked this version. */
  votes: number
  /** Visitors' plays heard through the group (see PlaysCount). */
  plays: number
  /** Of those plays, how many reached the end (90% of the track). */
  completed: number
}

/** A pick that came with a name or a comment (owner's Versions page). */
export interface VersionComment {
  /** The version picked. */
  trackId: string
  /** The name the visitor gave, if any. */
  name: string | null
  /** The visitor's note to the owner, if any. */
  comment: string | null
  /** When the pick was made or last changed (ISO). */
  updatedAt: string
  /** Made or changed since the owner's last visit to the group ("New" badge). */
  isNew: boolean
}

/** Response of GET /api/playlists/:id/feedback: the feedback on a group of versions. */
export interface VersionFeedback {
  /** Voting is open: no version of the group is marked final yet. */
  open: boolean
  /** Votes counted (picks of versions still in the group). */
  votes: number
  /** Different visitors who listened through the group's link. */
  listeners: number
  /** Every version of the group, in the group's order. */
  versions: VersionTally[]
  /** Picks with a name or a comment, most recent first. */
  comments: VersionComment[]
  /** Votes cast or changed since the owner's last visit to the group (counted votes only). */
  unseen: number
  /**
   * When the server read this feedback (ISO). Leaving the page marks the
   * group seen up to this instant, not up to "now": a vote that arrived
   * while the owner was looking at an older copy stays new.
   */
  asOf: string
}

/**
 * Response of GET /api/feedback/unseen: feedback the owner has not seen yet,
 * for the dot on "Versions" and the badges on the groups' cards. "Unseen"
 * means a vote cast or changed (comment included) after the owner's last
 * visit to that group's page.
 */
export interface UnseenFeedback {
  /** Unseen votes over every group (0: no dot). */
  total: number
  /** Unseen votes per group id; groups with none are left out. */
  groups: Record<string, number>
}

/** A visitor's own pick in a group of versions. */
export interface VersionPick {
  /** The version picked. */
  trackId: string
  /** The name the visitor gave, if any. */
  name: string | null
  /** The visitor's note to the owner, if any. */
  comment: string | null
}

/**
 * Response of GET /api/shared/playlists/:id/vote: what the public page of a
 * group needs for its vote buttons. Nobody else's pick is ever included.
 */
export interface VersionVoteState {
  /** Voting is open (no version is final yet). */
  open: boolean
  /** The signed-in viewer owns the group: they choose, friends vote (the page shows a note). */
  isOwner: boolean
  /** This browser's current pick, or null. */
  pick: VersionPick | null
}

/**
 * What anyone with the link sees of an 'unlisted' or 'public' playlist.
 * Sharing a playlist shares all its tracks, private ones included, but
 * never the Suno prompt, the mastering status or storage paths.
 */
export interface SharedPlaylist {
  /** Row id: the share page's address (/p/:id). */
  id: string
  /** A group of versions is introduced as such ("Versions · 3 versions"). */
  purpose: PlaylistPurpose
  /** The playlist's name. */
  title: string
  /** Free text about it. */
  description: string | null
  /** Never 'private': a private playlist answers like a missing one. */
  visibility: Exclude<TrackVisibility, 'private'>
  /** Signed Storage URLs (6 h): visitors cannot use the owner-only /api/covers. */
  coverUrl: string | null
  /** Signed cover URLs of the first tracks that have one, for the automatic mosaic. */
  mosaic: string[]
  /** Sum of the tracks' durations, in seconds. */
  durationSeconds: number
  /** When it last changed (ISO 8601). */
  updatedAt: string
  /** In playlist order. Track visibility is not exposed, only whether each track is `downloadable`. */
  tracks: SharedTrackContent[]
}
