/**
 * Storage path conventions.
 *
 *   audio   (Cloudflare R2; locally Supabase Storage)  <userId>/<trackId>.<ext>
 *                                                      <userId>/<trackId>.<revision>.<ext>  (a replaced file)
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

/**
 * `<userId>/<trackId>.<ext>`, or `<userId>/<trackId>.<revision>.<ext>` for a
 * file that replaces the track's audio (see newAudioRevision); the extension
 * is normalized (no dot, lower case).
 */
export function buildAudioPath(userId: string, trackId: string, extension: string, revision?: string): string {
  // `.<revision>` between the id and the extension, for a replacement only.
  const middle = revision ? `.${revision}` : ''
  return `${userId}/${trackId}${middle}.${extension.replace(/^\./, '').toLowerCase()}`
}

/** A replacement's revision: exactly 8 lower-case hex characters (the database's rule, tracks_audio_path_exact). */
const AUDIO_REVISION = /^[0-9a-f]{8}$/

/**
 * A new revision for a replaced audio file: 8 random lower-case hex
 * characters. The new file is stored next to the old one under a key of its
 * own (never the key the track names, so a failed replace leaves the track
 * on its old file), and random rather than counted: no need to read the
 * current one, and no clash with the file of an earlier attempt that failed.
 */
export function newAudioRevision(): string {
  // 4 random bytes, 2 hex characters each.
  const bytes = crypto.getRandomValues(new Uint8Array(4))
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
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
 * True when the path is exactly an audio path of the track: `<userId>/<trackId>.<ext>`,
 * or a replacement's `<userId>/<trackId>.<revision>.<ext>`, with the
 * revision and extension the database accepts (tracks_audio_path_exact): the
 * same rule, so a path the server lets through is never refused later. The
 * server uses it to reject paths a client could forge, e.g. pointing a track
 * at someone else's file. Any extension used to pass here, control
 * characters included, and such a key then made the storage client throw
 * (isSafeStorageKey): a 500 where a forged path deserves a 400.
 */
export function isAudioPath(path: string, userId: string, trackId: string): boolean {
  // What must come before the extension: the user's folder and the track's id.
  const prefix = `${userId}/${trackId}.`
  if (!path.startsWith(prefix)) return false
  // What follows the id: `<ext>`, or `<revision>.<ext>`.
  const parts = path.slice(prefix.length).split('.')
  if (parts.length === 1) return AUDIO_EXTENSION.test(parts[0]!)
  return parts.length === 2 && AUDIO_REVISION.test(parts[0]!) && AUDIO_EXTENSION.test(parts[1]!)
}

/** True when the path is a replacement's audio path of the track, `<userId>/<trackId>.<revision>.<ext>` (see isAudioPath). */
export function isAudioRevisionPath(path: string, userId: string, trackId: string): boolean {
  // A revision adds one dot-separated part after the id.
  return isAudioPath(path, userId, trackId) && path.slice(`${userId}/${trackId}.`.length).includes('.')
}
