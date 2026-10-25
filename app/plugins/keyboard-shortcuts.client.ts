import { SEEK_STEP_SECONDS, shortcutFor, targetKeepsKey, type ShortcutAction } from '~/lib/keyboard-shortcuts'

/**
 * The player's keyboard shortcuts, on every page (the app's and the share
 * pages): Space play/pause, ← / → five seconds back / forward, Shift + ← / →
 * previous / next track, M mute, F the full-screen view, ? their list
 * (app/lib/keyboard-shortcuts.ts has the keys and the rules).
 *
 * A shortcut acts only when nothing else wants the key: not with Ctrl, Cmd
 * or Alt, not while a component has claimed the keyboard (the lyrics sync
 * editor, see useKeyboardClaim), not where the key has a meaning of its own
 * (typing, buttons, sliders, menus, dialogs: targetKeepsKey). And only with
 * something in the player: on an empty player, Space scrolls the page as
 * usual. A key it acts on goes no further (no page scroll on Space).
 *
 * Held down, ← and → keep seeking; the other keys act once per press.
 * `.client`: browser only.
 */
export default defineNuxtPlugin(() => {
  // What the shortcuts drive.
  const player = usePlayerStore()
  // Components that use the keys as a whole, for now.
  const claims = useKeyboardClaims()
  // The list of shortcuts (the `?` key).
  const help = useShortcutsHelp()

  /** Actions that make sense held down (each repeat moves a little more). */
  const REPEATABLE: readonly ShortcutAction[] = ['seek-back', 'seek-forward']

  useEventListener(window, 'keydown', (event: KeyboardEvent) => {
    // The shortcut this key press means, if any.
    const action = shortcutFor(event)
    if (!action || event.defaultPrevented || claims.value > 0) return
    if (targetKeepsKey(event.target instanceof Element ? event.target : null, action)) return
    // The list works with an empty player too.
    if (action === 'help') {
      event.preventDefault()
      help.value = true
      return
    }
    if (!player.isActive) return
    event.preventDefault()
    if (event.repeat && !REPEATABLE.includes(action)) return
    run(action)
  })

  /** Does what a shortcut stands for, through the store (as the buttons do). */
  function run(action: ShortcutAction) {
    switch (action) {
      case 'toggle-play':
        void player.togglePlay()
        break
      case 'seek-back':
      case 'seek-forward': {
        // Five seconds back or forward.
        const step = action === 'seek-back' ? -SEEK_STEP_SECONDS : SEEK_STEP_SECONDS
        // Not beyond the end (the store already keeps it from going before the start).
        const end = player.duration > 0 ? player.duration : Number.POSITIVE_INFINITY
        player.seek(Math.min(player.currentTime + step, end))
        break
      }
      case 'previous':
        void player.previous()
        break
      case 'next':
        // As the button: nothing after the last track (unless the queue loops).
        if (player.hasNext) void player.next()
        break
      case 'mute':
        player.toggleMute()
        break
      case 'full-screen':
        player.setExpanded(!player.expanded)
        break
      default:
        break
    }
  }
})
