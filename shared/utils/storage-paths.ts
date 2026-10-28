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

/** An audio file's extension as the database accepts it: 1 to 10 lower-case letters and digits. */
const AUDIO_EXTENSION = /^[a-z0-9]{1,10}$/

/**
 * True when the path is exactly the track's audio path, `<userId>/<trackId>.<ext>`,
 * with the extension the database accepts (tracks_audio_path_exact): the
 * same rule, so a path the server lets through is never refused later. The
 * server uses it to reject paths a client could forge, e.g. pointing a track
 * at someone else's file. Any extension used to pass here, control
 * characters included, and such a key then made the storage client throw
 * (isSafeStorageKey): a 500 where a forged path deserves a 400.
 */
export function isAudioPath(path: string, userId: string, trackId: string): boolean {
  // What must come before the extension: the user's folder and the track's id.
  const prefix = `${userId}/${trackId}.`
  return path.startsWith(prefix) && AUDIO_EXTENSION.test(path.slice(prefix.length))
}
