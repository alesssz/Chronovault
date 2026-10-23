/**
 * haptic(): vibrates where the Vibration API exists, and is a silent no-op
 * where it does not (iPhone, desktops) or where the browser refuses it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HAPTIC, haptic } from '~/lib/haptics'

describe('haptic', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('passes the pattern to navigator.vibrate', () => {
    const vibrate = vi.fn(() => true)
    vi.stubGlobal('navigator', { vibrate })
    haptic(HAPTIC.tick)
    haptic(HAPTIC.undo)
    expect(vibrate).toHaveBeenNthCalledWith(1, 15)
    expect(vibrate).toHaveBeenNthCalledWith(2, [10, 60, 10])
  })

  it('does nothing without the Vibration API', () => {
    vi.stubGlobal('navigator', {})
    expect(() => haptic(HAPTIC.tick)).not.toThrow()
  })

  it('never throws when the browser refuses', () => {
    vi.stubGlobal('navigator', {
      vibrate: () => {
        throw new Error('blocked')
      },
    })
    expect(() => haptic(HAPTIC.tick)).not.toThrow()
  })
})
