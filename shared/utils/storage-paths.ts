/**
 * Storage path conventions.
 *
 *   audio   (Cloudflare R2; locally Supabase Storage)  <userId>/<trackId>.<ext>
 *   covers  (Supabase Storage)                         <userId>/<trackId>.webp
 *                                                      <userId>/playlists/<playlistId>.webp
 *
 * The first folder is always the owner's id: the storage RLS policies
 * (upload only into your own folder) and the `tracks` / `playlists` table
 * constraints (paths must start with `user_id`) both rely on this rule.
 * Ids are random UUIDs, so paths cannot be guessed.
 */

/** Bucket of the audio files (the R2 bucket in production, a local Supabase bucket in development). */
export const AUDIO_BUCKET = 'audio'
/** Supabase Storage bucket of track and playlist covers. */
export const COVERS_BUCKET = 'covers'

/** `<userId>/<trackId>.<ext>`; the extension is normalized (no dot, lower case). */
export function buildAudioPath(userId: string, trackId: string, extension: string): string {
  return `${userId}/${trackId}.${extension.replace(/^\./, '').toLowerCase()}`
}

/** `<userId>/<trackId>.webp`: covers are always converted to WebP in the browser. */
export function buildCoverPath(userId: string, trackId: string): string {
  return `${userId}/${trackId}.webp`
}

/** Custom playlist covers: `<userId>/playlists/<playlistId>.webp` (never mistaken for a track file). */
export function buildPlaylistCoverPath(userId: string, playlistId: string): string {
  return `${userId}/playlists/${playlistId}.webp`
}

/**
 * True when the path is in the user's folder and refers to the given track
 * (any extension). The server uses it to reject paths a client could forge,
 * e.g. pointing a track at someone else's file.
 */
export function isTrackPath(path: string, userId: string, trackId: string): boolean {
  const parts = path.split('/')
  // Exactly `<folder>/<file>`: also rules out playlist covers and `..` tricks.
  if (parts.length !== 2) return false
  const [folder, file] = parts as [string, string]
  const dot = file.lastIndexOf('.')
  return folder === userId && dot > 0 && file.slice(0, dot) === trackId
}
