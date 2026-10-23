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
  static instances: FakeCloseWatcher[] = []
  onclose: ((event: Event) => void) | null = null
  destroyed = false
  /** Already fired its close: a real watcher is inactive from then on. */
  spent = false
  constructor() {
    FakeCloseWatcher.instances.push(this)
  }

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
  const open = ref(false)
  const close = vi.fn(() => {
    if (!options.refuse) open.value = false
  })
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
    const { open, close } = setUp()
    open.value = true
    await nextTick()
    expect(live()).toHaveLength(1)

    live()[0]!.back()
    expect(close).toHaveBeenCalledOnce()
    expect(open.value).toBe(false)
  })

  it('closing it another way drops the watcher, so back is free again', async () => {
    const { open } = setUp()
    open.value = true
    await nextTick()
    const watcher = live()[0]!

    open.value = false
    await nextTick()
    expect(watcher.destroyed).toBe(true)
  })

  it('a refused close (locked dialog) arms a new watcher for the next back press', async () => {
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
    const { open, stop } = setUp()
    open.value = true
    await nextTick()
    const watcher = live()[0]!

    stop()
    expect(watcher.destroyed).toBe(true)
  })

  it('does nothing where the browser has no CloseWatcher', async () => {
    vi.stubGlobal('CloseWatcher', undefined)
    const { open, close } = setUp()
    open.value = true
    await nextTick()
    expect(FakeCloseWatcher.instances).toHaveLength(0)
    expect(close).not.toHaveBeenCalled()
  })
})
