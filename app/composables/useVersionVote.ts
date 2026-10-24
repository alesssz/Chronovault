import type { VersionVoteState } from '~~/shared/types/playlist'
import { getListenerId } from '~/lib/listener-id'
import { sharedApi } from '~/services/api'

/**
 * The visitor's vote on the public page of a group of versions (/p/:id):
 * whether voting is open, the visitor's pick, and the actions to pick,
 * change, take back and annotate it.
 *
 * The state is per browser (app/lib/listener-id.ts), so it loads in the
 * browser only, after the server-rendered page is on screen. Until then, and
 * on a playlist that is not a group, `state` is null and the page shows no
 * vote buttons.
 *
 * Failures show a toast; "voting is closed" (409, the owner chose a final
 * version meanwhile) reloads the state, so the buttons go away.
 */
export function useVersionVote(playlistId: string, isGroup: () => boolean) {
  // Failure messages.
  const toast = useToast()
  /** Vote state for this browser; null until loaded (or when not a group). */
  const state = ref<VersionVoteState | null>(null)
  /** A request is running: the buttons wait. */
  const busy = ref(false)

  /** The visitor may vote here: a group, voting open, and not its owner. */
  const canVote = computed(() => !!state.value && state.value.open && !state.value.isOwner)

  /** Loads the state (on mount, and after "voting is closed"). */
  async function load() {
    if (!isGroup()) return
    try {
      state.value = await sharedApi.voteState(playlistId, getListenerId())
    }
    catch {
      // No vote buttons: listening still works.
      state.value = null
    }
  }

  /** Runs a vote request and adopts the state it returns; false when it failed. */
  async function send(request: () => Promise<VersionVoteState>, failureTitle: string): Promise<boolean> {
    busy.value = true
    try {
      state.value = await request()
      return true
    }
    catch (err) {
      if (getErrorStatus(err) === 409) {
        toast.add({ title: 'Voting is closed', description: 'The final version has just been chosen.', color: 'neutral' })
        await load()
      }
      else {
        toast.add({ title: failureTitle, description: getErrorMessage(err), color: 'error' })
      }
      return false
    }
    finally {
      busy.value = false
    }
  }

  /**
   * The pick button of a version: picks it (keeping the name and comment
   * already given), or takes the pick back when it is the current one.
   */
  async function toggle(trackId: string) {
    const pick = state.value?.pick
    if (pick?.trackId === trackId) {
      await send(() => sharedApi.withdrawVote(playlistId, getListenerId()), 'Pick not removed')
      return
    }
    await send(() => sharedApi.vote(playlistId, {
      voterId: getListenerId(),
      trackId,
      name: pick?.name ?? null,
      comment: pick?.comment ?? null,
    }), 'Pick not saved')
  }

  /** Saves a name and a comment with the current pick; true when saved. */
  async function saveNote(name: string, comment: string): Promise<boolean> {
    const pick = state.value?.pick
    if (!pick) return false
    const saved = await send(() => sharedApi.vote(playlistId, { voterId: getListenerId(), trackId: pick.trackId, name, comment }), 'Note not saved')
    if (saved) toast.add({ title: 'Note saved', description: 'Thanks for your feedback!', icon: 'i-lucide-check', color: 'success' })
    return saved
  }

  onMounted(load)

  return { state, busy, canVote, toggle, saveNote }
}
