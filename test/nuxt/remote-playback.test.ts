/**
 * useRemotePlayback (casting): the button shows when the browser reports a
 * device, or cannot tell until asked; it stays hidden without the API or
 * when remote playback is refused; the connection state follows the
 * browser's events; prompt() maps the picker's outcomes. The browser's
 * RemotePlayback object is replaced by a fake.
 */
import { describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { useRemotePlayback } from '~/composables/useRemotePlayback'

/** Stand-in for `element.remote`: the test drives availability, state and the picker's outcome. */
class FakeRemote extends EventTarget {
  state: RemotePlaybackState = 'disconnected'
  /** The availability callback the composable registered. */
  report: ((available: boolean) => void) | null = null
  cancelled: number[] = []
  /** What prompt() does: resolve, or reject with this error name. */
  promptError: string | null = null

  constructor(private watchError: string | null = null) {
    super()
  }

  watchAvailability(callback: (available: boolean) => void) {
    if (this.watchError) return Promise.reject(new DOMException('', this.watchError))
    this.report = callback
    return Promise.resolve(7)
  }

  cancelWatchAvailability(id: number) {
    this.cancelled.push(id)
    return Promise.resolve()
  }

  prompt() {
    return this.promptError ? Promise.reject(new DOMException('', this.promptError)) : Promise.resolve()
  }

  /** The browser's connection changes (connecting → connect, or disconnect). */
  move(state: RemotePlaybackState, event: string) {
    this.state = state
    this.dispatchEvent(new Event(event))
  }
}

/** Runs the composable in its own scope on a fake media element carrying `remote`. */
function setUp(remote: FakeRemote | undefined) {
  const element = ref({ remote } as unknown as HTMLMediaElement)
  const scope = effectScope()
  const cast = scope.run(() => useRemotePlayback(element))!
  return { cast, element, stop: () => scope.stop() }
}

/** Lets the watchAvailability promise settle. */
const settle = () => new Promise(resolve => setTimeout(resolve))

describe('useRemotePlayback', () => {
  it('shows the button when the browser reports a device, and hides it when it goes away', async () => {
    const remote = new FakeRemote()
    const { cast } = setUp(remote)
    expect(cast.available.value).toBe(false)

    remote.report!(true)
    expect(cast.available.value).toBe(true)
    remote.report!(false)
    expect(cast.available.value).toBe(false)
  })

  it('shows the button when the browser can only look for devices when asked', async () => {
    const { cast } = setUp(new FakeRemote('NotSupportedError'))
    await settle()
    expect(cast.available.value).toBe(true)
  })

  it('stays hidden when remote playback is refused or missing', async () => {
    const refused = setUp(new FakeRemote('InvalidStateError'))
    await settle()
    expect(refused.cast.available.value).toBe(false)

    const missing = setUp(undefined)
    expect(missing.cast.available.value).toBe(false)
    expect(await missing.cast.prompt()).toBe('failed')
  })

  it('follows the connection state', () => {
    const remote = new FakeRemote()
    const { cast } = setUp(remote)

    remote.move('connecting', 'connecting')
    expect(cast.state.value).toBe('connecting')
    remote.move('connected', 'connect')
    expect(cast.state.value).toBe('connected')
    remote.move('disconnected', 'disconnect')
    expect(cast.state.value).toBe('disconnected')
  })

  it('reports how the device picker ended', async () => {
    const remote = new FakeRemote()
    const { cast } = setUp(remote)

    expect(await cast.prompt()).toBe('done')
    remote.promptError = 'NotAllowedError'
    expect(await cast.prompt()).toBe('cancelled')
    remote.promptError = 'NotFoundError'
    expect(await cast.prompt()).toBe('no-devices')
    remote.promptError = 'OperationError'
    expect(await cast.prompt()).toBe('failed')
  })

  it('stops watching when the component goes away', async () => {
    const remote = new FakeRemote()
    const { stop } = setUp(remote)
    await settle()
    const listener = vi.spyOn(remote, 'removeEventListener')

    stop()
    expect(remote.cancelled).toEqual([7])
    expect(listener).toHaveBeenCalledTimes(3)
  })

  it('moves to a new element when it changes', async () => {
    const first = new FakeRemote()
    const second = new FakeRemote()
    const { cast, element } = setUp(first)
    await settle()
    first.report!(true)

    element.value = { remote: second } as unknown as HTMLMediaElement
    await nextTick()
    // The old element's watch is cancelled and the button waits for the new one's report.
    expect(first.cancelled).toEqual([7])
    expect(cast.available.value).toBe(false)
    second.report!(true)
    expect(cast.available.value).toBe(true)
  })
})
