/**
 * Storage path conventions.
 *
 *   audio   (Cloudflare R2; locally Supabase Storage)  <userId>/<trackId>.<ext>
 *   covers  (Supabase Storage)                         <userId>/<trackId>.webp
 *                                                      <userId>/playlists/<playlistId>.webp
 *
 * The first folder is always the owner's id: the storage RLS policies
 * (upload only into your own folder) rely on this rule, and the `tracks` /
 * `playlists` table constraints accept exactly these shapes, with the row's
 * own ids (…_storage_path_rules.sql), so a row can only name its own files.
 * Ids are random UUIDs, so paths cannot be guessed. The builders below are
 * the only source of paths; isSafeStorageKey guards the server's signing.
 */

/** Bucket of the audio files (the R2 bucket in production, a local Supabase bucket in development). */
export const AUDIO_BUCKET = 'audio'
/** Supabase Storage bucket of track and playlist covers. */
export const COVERS_BUCKET = 'covers'

/**
 * True when a storage key names one file by a plain path: no empty, `.` or
 * `..` segment, no backslash, no control character. URL parsing resolves
 * `a/../b` to `b`, so signing such a key would grant another file than the
 * one named; the server refuses to sign or touch one, whatever the database
 * holds (its constraints already allow only the shapes built below).
 */
export function isSafeStorageKey(key: string): boolean {
  // eslint-disable-next-line no-control-regex -- control characters are exactly what is refused
  if (!key || key.includes('\\') || /[\u0000-\u001F\u007F]/.test(key)) return false
  return key.split('/').every(segment => segment !== '' && segment !== '.' && segment !== '..')
}

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
  // The folder and the file name.
  const parts = path.split('/')
  // Exactly `<folder>/<file>`: also rules out playlist covers and `..` tricks.
  if (parts.length !== 2) return false
  // Exactly two parts, checked just above.
  const [folder, file] = parts as [string, string]
  // Where the extension starts: the name before it must be the track id.
  const dot = file.lastIndexOf('.')
  return folder === userId && dot > 0 && file.slice(0, dot) === trackId
}
