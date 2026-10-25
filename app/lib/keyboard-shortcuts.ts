/**
 * The player's keyboard shortcuts, everywhere in the app and on the share
 * pages (app/plugins/keyboard-shortcuts.client.ts listens for them): which
 * key does what, and when a key belongs to something else instead.
 *
 * A shortcut never takes a key from what already uses it:
 * - text fields (typing), and any dialog but the player's full-screen view;
 * - Space on what Space activates (buttons, links, checkboxes, menu items…):
 *   it would act twice. On the waveform (a slider) Space is free, so a
 *   click on it to seek, then Space to pause, works;
 * - the arrows on what moves with them (sliders, the waveform included,
 *   menus, lists, tabs, radio groups);
 * - letters inside menus and lists, which find their items by typing;
 * - any key with Ctrl, Cmd or Alt: those are the browser's and the system's.
 * A component that uses the keyboard as a whole (the lyrics sync editor)
 * claims it instead (useKeyboardClaim), and the shortcuts wait.
 */

/** What a shortcut does. */
export type ShortcutAction = 'toggle-play' | 'seek-back' | 'seek-forward' | 'previous' | 'next' | 'mute' | 'full-screen' | 'help'

/** Seconds ← and → move (the same step as the waveform's own arrows). */
export const SEEK_STEP_SECONDS = 5

/** One shortcut, as the help dialog and the buttons' `aria-keyshortcuts` show it. */
export interface ShortcutInfo {
  /** What the shortcut does. */
  action: ShortcutAction
  /** The keys, as written on the keyboard ("Shift", "→"…), for the help dialog. */
  keys: string[]
  /** The same, in the ARIA `aria-keyshortcuts` syntax ("Shift+ArrowRight"). */
  aria: string
  /** What it does, for the help dialog. */
  label: string
}

/** Every shortcut, in the order the help dialog lists them. */
export const SHORTCUTS: readonly ShortcutInfo[] = [
  { action: 'toggle-play', keys: ['Space'], aria: 'Space', label: 'Play / pause' },
  { action: 'seek-back', keys: ['←'], aria: 'ArrowLeft', label: `Back ${SEEK_STEP_SECONDS} seconds` },
  { action: 'seek-forward', keys: ['→'], aria: 'ArrowRight', label: `Forward ${SEEK_STEP_SECONDS} seconds` },
  { action: 'previous', keys: ['Shift', '←'], aria: 'Shift+ArrowLeft', label: 'Previous track (or the start of this one)' },
  { action: 'next', keys: ['Shift', '→'], aria: 'Shift+ArrowRight', label: 'Next track' },
  { action: 'mute', keys: ['M'], aria: 'M', label: 'Mute / unmute' },
  { action: 'full-screen', keys: ['F'], aria: 'F', label: 'Full-screen player (open / close)' },
  { action: 'help', keys: ['?'], aria: 'Shift+?', label: 'This list' },
]

/** The `aria-keyshortcuts` value of an action, for the buttons that do the same. */
export function ariaShortcut(action: ShortcutAction): string {
  return SHORTCUTS.find(s => s.action === action)!.aria
}

/** The part of a keyboard event that decides the shortcut (a plain object in the tests). */
export interface KeyPress {
  /** The key's value (`" "`, `"ArrowLeft"`, `"m"`…), as KeyboardEvent.key gives it. */
  key: string
  /** Shift is held. */
  shiftKey: boolean
  /** Ctrl is held (such combinations are left to the browser). */
  ctrlKey: boolean
  /** Cmd (or the Windows key) is held (left to the browser and the system). */
  metaKey: boolean
  /** Alt (Option) is held (left to the browser and the system). */
  altKey: boolean
}

/**
 * The shortcut a key press means, or null. Letters are matched whatever the
 * case (Caps Lock), and on the key they produce, so they follow the
 * keyboard's layout.
 */
export function shortcutFor(press: KeyPress): ShortcutAction | null {
  // The browser's and the system's own combinations.
  if (press.ctrlKey || press.metaKey || press.altKey) return null
  switch (press.key) {
    case ' ': return press.shiftKey ? null : 'toggle-play'
    case 'ArrowLeft': return press.shiftKey ? 'previous' : 'seek-back'
    case 'ArrowRight': return press.shiftKey ? 'next' : 'seek-forward'
    case 'm': case 'M': return 'mute'
    case 'f': case 'F': return 'full-screen'
    // Shift + the "?" key on most layouts: the key it produces is "?".
    case '?': return 'help'
    default: return null
  }
}

/** Typing places: no shortcut ever. */
const TEXT_FIELDS = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]'
/** What Space activates by itself (a shortcut would act twice). */
const SPACE_ACTIVATES = 'button, a[href], summary, [role="button"], [role="checkbox"], [role="switch"], [role="radio"], [role="menuitem"], [role="option"], [role="tab"]'
/** What moves with the arrows (the waveform is a slider). */
const ARROWS_MOVE = '[role="slider"], [role="menu"], [role="menuitem"], [role="listbox"], [role="option"], [role="radiogroup"], [role="radio"], [role="tablist"], [role="tab"]'
/** What finds its items by typing letters. */
const LETTERS_SEARCH = '[role="menu"], [role="listbox"]'
/** Dialogs, whose keys are their own… */
const DIALOGS = '[role="dialog"], [role="alertdialog"]'
/** …except the player's full-screen view, marked with this attribute (PlayerExpanded). */
export const PLAYER_VIEW_ATTRIBUTE = 'data-player-shortcuts'

/** The element where the key press happened keeps it: the shortcut must not act. */
export function targetKeepsKey(target: Element | null, action: ShortcutAction): boolean {
  if (!target) return false
  if (target.closest(TEXT_FIELDS)) return true
  // In a dialog: only the player's own view lets the shortcuts through.
  if (target.closest(DIALOGS) && !target.closest(`[${PLAYER_VIEW_ATTRIBUTE}]`)) return true
  switch (action) {
    case 'toggle-play': return !!target.closest(SPACE_ACTIVATES)
    case 'seek-back': case 'seek-forward': case 'previous': case 'next': return !!target.closest(ARROWS_MOVE)
    default: return !!target.closest(LETTERS_SEARCH)
  }
}
