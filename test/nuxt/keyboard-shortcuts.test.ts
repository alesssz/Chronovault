/**
 * When a key belongs to what it was pressed on rather than to the player's shortcuts
 * (targetKeepsKey, app/lib/keyboard-shortcuts.ts), on real DOM elements (happy-dom): text fields
 * keep every key; Space stays with buttons, links and menu items but not with the waveform (a
 * slider); the arrows stay with sliders and menus; letters with menus; dialogs keep everything,
 * except the player's full-screen view.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { PLAYER_VIEW_ATTRIBUTE, targetKeepsKey } from '~/lib/keyboard-shortcuts'

/** Puts `html` in the page and returns the element marked `data-target` (or the first one). */
function element(html: string): Element {
  document.body.innerHTML = html
  return document.querySelector('[data-target]') ?? document.body.firstElementChild!
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('targetKeepsKey', () => {
  it('lets every shortcut through on the page itself', () => {
    expect(targetKeepsKey(document.body, 'toggle-play')).toBe(false)
    expect(targetKeepsKey(document.body, 'seek-forward')).toBe(false)
    expect(targetKeepsKey(document.body, 'mute')).toBe(false)
    expect(targetKeepsKey(null, 'toggle-play')).toBe(false)
  })

  it('keeps every key in text fields', () => {
    for (const html of ['<input>', '<textarea></textarea>', '<select></select>', '<div contenteditable="true"></div>']) {
      expect(targetKeepsKey(element(html), 'mute')).toBe(true)
      expect(targetKeepsKey(element(html), 'toggle-play')).toBe(true)
    }
  })

  it('leaves Space to what it activates, but not to the waveform', () => {
    expect(targetKeepsKey(element('<button>Play</button>'), 'toggle-play')).toBe(true)
    expect(targetKeepsKey(element('<a href="/x">Link</a>'), 'toggle-play')).toBe(true)
    expect(targetKeepsKey(element('<div role="menuitem">Edit</div>'), 'toggle-play')).toBe(true)
    expect(targetKeepsKey(element('<div role="slider" tabindex="0"></div>'), 'toggle-play')).toBe(false)
  })

  it('leaves the arrows to sliders and menus, not to buttons', () => {
    expect(targetKeepsKey(element('<div role="slider" tabindex="0"></div>'), 'seek-back')).toBe(true)
    expect(targetKeepsKey(element('<div role="menu"><span data-target>Edit</span></div>'), 'next')).toBe(true)
    expect(targetKeepsKey(element('<button>Play</button>'), 'seek-forward')).toBe(false)
  })

  it('leaves letters to menus (they find items by typing), not to buttons', () => {
    expect(targetKeepsKey(element('<div role="menu"><span data-target>Edit</span></div>'), 'mute')).toBe(true)
    expect(targetKeepsKey(element('<button>Play</button>'), 'full-screen')).toBe(false)
  })

  it('keeps every key in a dialog, except the player\'s full-screen view', () => {
    expect(targetKeepsKey(element('<div role="dialog"><p data-target>Delete?</p></div>'), 'toggle-play')).toBe(true)
    expect(targetKeepsKey(element(`<div role="dialog"><div ${PLAYER_VIEW_ATTRIBUTE}><p data-target>Song</p></div></div>`), 'toggle-play')).toBe(false)
    // Its buttons still keep Space, like anywhere else.
    expect(targetKeepsKey(element(`<div role="dialog"><div ${PLAYER_VIEW_ATTRIBUTE}><button data-target>Next</button></div></div>`), 'toggle-play')).toBe(true)
  })
})
