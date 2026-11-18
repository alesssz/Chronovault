import type { DropdownMenuItem } from '@nuxt/ui'
import type { PlaylistDetail, PlaylistPurpose, PlaylistSummary } from '~~/shared/types/playlist'
import { isVersionOf } from '~/lib/feedback-playlist'
import { playlistsApi } from '~/services/api'
import { getErrorMessage } from '~/utils/errors'

/**
 * The user's playlists or groups of versions, one purpose at a time (see
 * PlaylistPurpose). Each purpose has its own cache key, shared across pages: the
 * Playlists page, "Add to playlist" menus and a playlist page all read and
 * update the same 'playlist' list; the Versions pages the 'versions' one.
 */
export function usePlaylistList(purpose: PlaylistPurpose) {
  const { data, refresh, status } = useAsyncData(`playlists-${purpose}`, () => playlistsApi.list(purpose), {
    default: () => [] as PlaylistSummary[],
  })

  /**
   * Keeps the cached list in sync after a change made elsewhere (created,
   * renamed, tracks changed). An item of the other purpose is not this list's
   * business and is ignored.
   */
  function remember(detail: PlaylistDetail): void {
    if (detail.purpose !== purpose) return
    const { coverPath: _c, tracks: _t, privateTrackCount: _p, ...summary } = detail
    data.value = data.value.some(p => p.id === summary.id)
      ? data.value.map(p => (p.id === summary.id ? summary : p))
      : [summary, ...data.value]
  }

  /** Drops a deleted item from the cached list. */
  function forget(id: string): void {
    data.value = data.value.filter(p => p.id !== id)
  }

  return { items: data, status, refresh, remember, forget }
}

/**
 * Appends tracks to one of the user's playlists or groups (`purpose`),
 * keeps that purpose's cached list in sync and tells the user how it went.
 */
function useAddTracks(purpose: PlaylistPurpose) {
  const toast = useToast()
  const list = usePlaylistList(purpose)
  const { noun } = PLAYLIST_PURPOSE_INFO[purpose]

  async function add(target: Pick<PlaylistSummary, 'id' | 'title'>, trackIds: string[]): Promise<void> {
    try {
      // The track count before (undefined when the list is not cached: assume all were added).
      const before = list.items.value.find(p => p.id === target.id)?.trackCount
      const updated = await playlistsApi.addTracks(target.id, trackIds)
      list.remember(updated)
      // How many were really added (tracks already in it are skipped).
      const added = before === undefined ? trackIds.length : updated.trackCount - before
      toast.add(added > 0
        ? { title: `Added to ${target.title}`, icon: 'i-lucide-list-plus', color: 'success' }
        : { title: `Already in ${target.title}`, icon: 'i-lucide-list-checks' })
    }
    catch (err) {
      toast.add({ title: `Not added to the ${noun}`, description: getErrorMessage(err), color: 'error' })
    }
  }

  return { list, add }
}

/**
 * The user's curated playlists (never the groups of versions), the
 * "New playlist" dialog and "Add to playlist".
 */
export function usePlaylists() {
  const { list, add: addToPlaylist } = useAddTracks('playlist')
  const { items: data, refresh, status, remember, forget } = list

  // The dialog lives in the layout: any page can open it.
  const createDialog = useState('playlist-create-dialog', () => ({ open: false, trackIds: [] as string[] }))

  /** Opens the "New playlist" dialog; the new playlist will contain `trackIds`. */
  function openCreateDialog(trackIds: string[] = []): void {
    createDialog.value = { open: true, trackIds }
  }

  /** Creates a playlist (optionally with tracks) and adds it to the cached list. */
  async function createPlaylist(title: string, trackIds: string[] = []): Promise<PlaylistDetail> {
    const created = await playlistsApi.create({ title, trackIds })
    remember(created)
    return created
  }

  /**
   * "Add to playlist" menu entries: "New playlist…", then every playlist
   * (groups of versions have their own menu: useVersionGroups).
   * `trackIds` is read when an entry is picked (e.g. the current selection).
   */
  function addToPlaylistMenu(trackIds: () => string[]): DropdownMenuItem[][] {
    return [
      [{ label: 'New playlist…', icon: 'i-lucide-plus', onSelect: () => openCreateDialog(trackIds()) }],
      data.value.map(playlist => ({
        label: playlist.title,
        icon: 'i-lucide-list-music',
        onSelect: () => void addToPlaylist(playlist, trackIds()),
      })),
    ].filter(group => group.length > 0)
  }

  return { playlists: data, status, refresh, createDialog, openCreateDialog, createPlaylist, addToPlaylist, addToPlaylistMenu, remember, forget }
}

/**
 * "Add to group": a version made after the others were shared joins their
 * group. Kept apart from "Add to playlist", like the Versions page from the
 * Playlists page; a group is still created only by "Share for feedback".
 */
export function useVersionGroups() {
  const { list, add } = useAddTracks('versions')

  /**
   * One entry per group, newest first, the groups of the track's own song
   * (`isVersionOf` its title) on top, set apart by a divider: the likely
   * choice first, every other one still there. No entries when the user has no
   * group (the menu item is then left out).
   */
  function addToGroupMenu(trackTitle: string, trackIds: () => string[]): DropdownMenuItem[][] {
    const entry = (group: PlaylistSummary): DropdownMenuItem => ({
      label: group.title,
      icon: PLAYLIST_PURPOSE_INFO.versions.icon,
      onSelect: () => void add(group, trackIds()),
    })
    const own = list.items.value.filter(group => isVersionOf(trackTitle, group.title))
    const others = list.items.value.filter(group => !own.includes(group))
    return [own.map(entry), others.map(entry)].filter(section => section.length > 0)
  }

  return { groups: list.items, addToGroupMenu }
}
