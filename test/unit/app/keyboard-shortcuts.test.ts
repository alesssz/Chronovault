/**
 * Which key press means which player shortcut (app/lib/keyboard-shortcuts.ts): Space, the arrows
 * with and without Shift, M, F and ?, whatever the case; nothing with Ctrl, Cmd or Alt, nor for
 * other keys; and the table the help dialog and the buttons' aria-keyshortcuts read.
 */
import { describe, expect, it } from 'vitest'
import { ariaShortcut, SHORTCUTS, shortcutFor, type KeyPress } from '~/lib/keyboard-shortcuts'

/** A key press with no modifier unless given. */
function press(key: string, modifiers: Partial<Omit<KeyPress, 'key'>> = {}): KeyPress {
  return { key, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, ...modifiers }
}

describe('shortcutFor', () => {
  it('maps the player\'s keys', () => {
    expect(shortcutFor(press(' '))).toBe('toggle-play')
    expect(shortcutFor(press('ArrowLeft'))).toBe('seek-back')
    expect(shortcutFor(press('ArrowRight'))).toBe('seek-forward')
    expect(shortcutFor(press('ArrowLeft', { shiftKey: true }))).toBe('previous')
    expect(shortcutFor(press('ArrowRight', { shiftKey: true }))).toBe('next')
    expect(shortcutFor(press('?', { shiftKey: true }))).toBe('help')
  })

  it('matches letters whatever the case (Caps Lock, Shift)', () => {
    expect(shortcutFor(press('m'))).toBe('mute')
    expect(shortcutFor(press('M', { shiftKey: true }))).toBe('mute')
    expect(shortcutFor(press('f'))).toBe('full-screen')
    expect(shortcutFor(press('F'))).toBe('full-screen')
  })

  it('leaves Ctrl, Cmd and Alt combinations to the browser and the system', () => {
    expect(shortcutFor(press('f', { ctrlKey: true }))).toBeNull()
    expect(shortcutFor(press('m', { metaKey: true }))).toBeNull()
    expect(shortcutFor(press('ArrowLeft', { altKey: true }))).toBeNull()
  })

  it('means nothing for other keys, or Shift + Space', () => {
    expect(shortcutFor(press('a'))).toBeNull()
    expect(shortcutFor(press('Enter'))).toBeNull()
    expect(shortcutFor(press('ArrowUp'))).toBeNull()
    expect(shortcutFor(press(' ', { shiftKey: true }))).toBeNull()
  })
})

describe('the shortcuts table', () => {
  it('lists every action once, each with its keys, its ARIA form and a label', () => {
    // The actions, in the order the help lists them.
    const actions = SHORTCUTS.map(s => s.action)
    expect(new Set(actions).size).toBe(actions.length)
    expect(actions).toEqual(['toggle-play', 'seek-back', 'seek-forward', 'previous', 'next', 'mute', 'full-screen', 'help'])
    for (const shortcut of SHORTCUTS) {
      expect(shortcut.keys.length).toBeGreaterThan(0)
      expect(shortcut.label).not.toBe('')
    }
  })

  it('gives the buttons the ARIA form of their shortcut', () => {
    expect(ariaShortcut('toggle-play')).toBe('Space')
    expect(ariaShortcut('next')).toBe('Shift+ArrowRight')
    expect(ariaShortcut('full-screen')).toBe('F')
  })
})
