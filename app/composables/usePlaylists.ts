import type { DropdownMenuItem } from '@nuxt/ui'
import type { PlaylistDetail, PlaylistSummary } from '~~/shared/types/playlist'
import { playlistsApi } from '~/services/api'
import { getErrorMessage } from '~/utils/errors'

/**
 * The user's playlists (shared across pages through their cache key),
 * the "New playlist" dialog and "Add to playlist".
 */
export function usePlaylists() {
  // "Added to …" feedback.
  const toast = useToast()
  const { data, refresh, status } = useAsyncData('playlists', () => playlistsApi.list(), {
    default: () => [] as PlaylistSummary[],
  })

  // The dialog lives in the layout: any page can open it.
  const createDialog = useState('playlist-create-dialog', () => ({ open: false, trackIds: [] as string[] }))

  /** Opens the "New playlist" dialog; the new playlist will contain `trackIds`. */
  function openCreateDialog(trackIds: string[] = []): void {
    createDialog.value = { open: true, trackIds }
  }

  /** Keeps the cached list in sync after a change made elsewhere. */
  function remember(detail: PlaylistDetail): void {
    const { coverPath: _c, tracks: _t, privateTrackCount: _p, ...summary } = detail
    data.value = data.value.some(p => p.id === summary.id)
      ? data.value.map(p => (p.id === summary.id ? summary : p))
      : [summary, ...data.value]
  }

  /** Drops a deleted playlist from the cached list. */
  function forget(id: string): void {
    data.value = data.value.filter(p => p.id !== id)
  }

  /** Creates a playlist (optionally with tracks) and adds it to the cached list. */
  async function createPlaylist(title: string, trackIds: string[] = []): Promise<PlaylistDetail> {
    const created = await playlistsApi.create({ title, trackIds })
    remember(created)
    return created
  }

  /** Appends tracks to a playlist and tells the user how it went. */
  async function addToPlaylist(playlist: Pick<PlaylistSummary, 'id' | 'title'>, trackIds: string[]): Promise<void> {
    try {
      const before = data.value.find(p => p.id === playlist.id)?.trackCount
      const updated = await playlistsApi.addTracks(playlist.id, trackIds)
      remember(updated)
      const added = before === undefined ? trackIds.length : updated.trackCount - before
      toast.add(added > 0
        ? { title: `Added to ${playlist.title}`, icon: 'i-lucide-list-plus', color: 'success' }
        : { title: `Already in ${playlist.title}`, icon: 'i-lucide-list-checks' })
    }
    catch (err) {
      toast.add({ title: 'Not added to the playlist', description: getErrorMessage(err), color: 'error' })
    }
  }

  /**
   * "Add to playlist" menu entries: "New playlist…", then every playlist.
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
