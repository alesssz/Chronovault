/**
 * useCloseOnBack: while an overlay is open a CloseWatcher catches the Android
 * back button and closes it; closing it some other way drops the watcher; a
 * refused close (a locked dialog) arms it again; Esc on a keyboard is left to
 * Nuxt UI; without the API nothing happens. The browser's CloseWatcher is
 * replaced by a fake that records its instances.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { useCloseOnBack } from '~/composables/useCloseOnBack'

/** Stand-in for the browser's CloseWatcher: `back()` plays the user's close request. */
class FakeCloseWatcher {
  /** Every watcher made, in order. */
  static instances: FakeCloseWatcher[] = []
  /** The handler the composable sets. */
  onclose: ((event: Event) => void) | null = null
  /** destroy() was called. */
  destroyed = false
  /** Already fired its close: a real watcher is inactive from then on. */
  spent = false
  /** Records itself, like the browser keeps it active. */
  constructor() {
    FakeCloseWatcher.instances.push(this)
  }

  /** The composable dropped it. */
  destroy() {
    this.destroyed = true
  }

  /** The Android back button: fires `close` once, as the real API does. */
  back() {
    this.spent = true
    this.onclose?.(new Event('close'))
  }
}

/** Watchers neither destroyed nor spent, newest last. */
const live = () => FakeCloseWatcher.instances.filter(w => !w.destroyed && !w.spent)

/** Runs the composable in its own effect scope, like a component would; returns its state and a stop. */
function setUp(options: { refuse?: boolean } = {}) {
  // Whether the overlay is open.
  const open = ref(false)
  // The overlay's close function (a locked dialog refuses: it stays open).
  const close = vi.fn(() => {
    if (!options.refuse) open.value = false
  })
  // The composable's scope, stopped to simulate the component going away.
  const scope = effectScope()
  scope.run(() => useCloseOnBack(open, close))
  return { open, close, stop: () => scope.stop() }
}

describe('useCloseOnBack', () => {
  /** Fake clock for performance.now(): far from any earlier Esc in every test. */
  let clock = 0

  beforeEach(() => {
    FakeCloseWatcher.instances = []
    vi.stubGlobal('CloseWatcher', FakeCloseWatcher)
    clock += 10_000
    vi.spyOn(performance, 'now').mockImplementation(() => clock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('back closes the open overlay', async () => {
    // An overlay that closes when asked.
    const { open, close } = setUp()
    open.value = true
    await nextTick()
    expect(live()).toHaveLength(1)

    live()[0]!.back()
    expect(close).toHaveBeenCalledOnce()
    expect(open.value).toBe(false)
  })

  it('closing it another way drops the watcher, so back is free again', async () => {
    // An overlay that closes when asked.
    const { open } = setUp()
    open.value = true
    await nextTick()
    // The watcher armed by the opening.
    const watcher = live()[0]!

    open.value = false
    await nextTick()
    expect(watcher.destroyed).toBe(true)
  })

  it('a refused close (locked dialog) arms a new watcher for the next back press', async () => {
    // An overlay that refuses to close (a locked dialog).
    const { open, close } = setUp({ refuse: true })
    open.value = true
    await nextTick()

    live()[0]!.back()
    await nextTick()
    expect(close).toHaveBeenCalledOnce()
    expect(open.value).toBe(true)
    // The spent watcher is replaced.
    expect(FakeCloseWatcher.instances).toHaveLength(2)
    expect(live()).toHaveLength(1)
  })

  it('Esc is left to Nuxt UI: no close from the watcher, re-armed while still open', async () => {
    // An overlay that closes when asked.
    const { open, close } = setUp()
    open.value = true
    await nextTick()

    // Esc closed a menu on top (Nuxt UI), and the browser turned the key into a close request too.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    live()[0]!.back()
    await nextTick()
    expect(close).not.toHaveBeenCalled()
    expect(live()).toHaveLength(1)
  })

  it('leaving the page while open drops the watcher', async () => {
    // An overlay, and the stop of its scope.
    const { open, stop } = setUp()
    open.value = true
    await nextTick()
    // The watcher armed by the opening.
    const watcher = live()[0]!

    stop()
    expect(watcher.destroyed).toBe(true)
  })

  it('does nothing where the browser has no CloseWatcher', async () => {
    vi.stubGlobal('CloseWatcher', undefined)
    // An overlay that closes when asked.
    const { open, close } = setUp()
    open.value = true
    await nextTick()
    expect(FakeCloseWatcher.instances).toHaveLength(0)
    expect(close).not.toHaveBeenCalled()
  })
})
