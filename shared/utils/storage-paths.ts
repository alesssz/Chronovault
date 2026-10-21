/**
 * Storage path convention: `<userId>/<trackId>.<ext>`.
 * The first folder is always the owner's id: storage RLS policies and the
 * `tracks` table constraints both rely on this rule.
 */

export const AUDIO_BUCKET = 'audio'
export const COVERS_BUCKET = 'covers'

export function buildAudioPath(userId: string, trackId: string, extension: string): string {
  return `${userId}/${trackId}.${extension.replace(/^\./, '').toLowerCase()}`
}

export function buildCoverPath(userId: string, trackId: string): string {
  return `${userId}/${trackId}.webp`
}

/** Custom playlist covers: `<userId>/playlists/<playlistId>.webp` (never mistaken for a track file). */
export function buildPlaylistCoverPath(userId: string, playlistId: string): string {
  return `${userId}/playlists/${playlistId}.webp`
}

/** True when the path is in the user's folder and refers to the given track. */
export function isTrackPath(path: string, userId: string, trackId: string): boolean {
  const parts = path.split('/')
  if (parts.length !== 2) return false
  const [folder, file] = parts as [string, string]
  const dot = file.lastIndexOf('.')
  return folder === userId && dot > 0 && file.slice(0, dot) === trackId
}
