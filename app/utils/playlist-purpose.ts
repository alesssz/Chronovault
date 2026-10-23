import type { PlaylistPurpose } from '~~/shared/types/playlist'

/**
 * How each playlist purpose is presented in the signed-in app: the section
 * that lists it (header link, page title, where "Back" goes), the word for
 * one of them and for the tracks in it.
 *   'playlist' → Playlists, "playlist", "track"
 *   'versions' → Versions, "group", "version"
 * Auto-imported (Nuxt scans app/utils).
 */
export const PLAYLIST_PURPOSE_INFO: Record<PlaylistPurpose, {
  /** Section name: header link and list page title. */
  section: string
  /** Address of the list page; one item lives at `<path>/<id>`. */
  path: string
  /** Icon of the section (header link, empty states). */
  icon: string
  /** One item of this purpose, lower case ("Delete playlist", "Group deleted"). */
  noun: string
  /** One track inside it, lower case ("3 versions"). */
  trackNoun: string
}> = {
  playlist: { section: 'Playlists', path: '/playlists', icon: 'i-lucide-list-music', noun: 'playlist', trackNoun: 'track' },
  versions: { section: 'Versions', path: '/versions', icon: 'i-lucide-layers', noun: 'group', trackNoun: 'version' },
}

/** Owner page of a playlist or a group of versions (/playlists/:id or /versions/:id). */
export function playlistPath(playlist: { id: string, purpose: PlaylistPurpose }): string {
  return `${PLAYLIST_PURPOSE_INFO[playlist.purpose].path}/${playlist.id}`
}
