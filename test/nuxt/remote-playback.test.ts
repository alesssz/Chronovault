/**
 * useRemotePlayback (casting): the button shows when the browser reports a
 * device, or cannot tell until asked; it stays hidden without the API or
 * when remote playback is refused; the connection state follows the
 * browser's events; prompt() maps the picker's outcomes, telling a picker
 * closed by the user from a browser that cannot cast (no API, or a refusal
 * too quick to be a person's). The browser's RemotePlayback object is
 * replaced by a fake.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { useRemotePlayback } from '~/composables/useRemotePlayback'

/** Stand-in for `element.remote`: the test drives availability, state and the picker's outcome. */
class FakeRemote extends EventTarget {
  /** The connection, as the browser reports it. */
  state: RemotePlaybackState = 'disconnected'
  /** The availability callback the composable registered. */
  report: ((available: boolean) => void) | null = null
  /** The watch ids the composable cancelled. */
  cancelled: number[] = []
  /** What prompt() does: resolve, or reject with this error name. */
  promptError: string | null = null
  /** How long the picker stays open before prompt() settles (ms of the fake clock). */
  promptTakes = 2000
  /** Moves the fake clock (see the performance.now() spy in the tests). */
  advance: (ms: number) => void = () => {}

  /** `watchError`: the error name watchAvailability() rejects with (null: it works). */
  constructor(private watchError: string | null = null) {
    super()
  }

  /** Registers the availability callback (or refuses, see watchError); 7 is the watch id. */
  watchAvailability(callback: (available: boolean) => void) {
    if (this.watchError) return Promise.reject(new DOMException('', this.watchError))
    this.report = callback
    return Promise.resolve(7)
  }

  /** Cancels an availability watch, remembering its id. */
  cancelWatchAvailability(id: number) {
    this.cancelled.push(id)
    return Promise.resolve()
  }

  /** Opens the fake picker: takes `promptTakes` of the fake clock, then settles as promptError says. */
  prompt() {
    // The user takes a while in the picker (or the browser refuses at once, promptTakes 0).
    this.advance(this.promptTakes)
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
  // A media element carrying the fake (or none, like a browser without the API).
  const element = ref({ remote } as unknown as HTMLMediaElement)
  // The scope the composable runs in, stopped to simulate the component going away.
  const scope = effectScope()
  // The composable's result.
  const cast = scope.run(() => useRemotePlayback(element))!
  return { cast, element, stop: () => scope.stop() }
}

/** Lets the watchAvailability promise settle. */
const settle = () => new Promise(resolve => setTimeout(resolve))

describe('useRemotePlayback', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows the button when the browser reports a device, and hides it when it goes away', async () => {
    // A browser that watches devices.
    const remote = new FakeRemote()
    // The composable on it.
    const { cast } = setUp(remote)
    expect(cast.available.value).toBe(false)

    remote.report!(true)
    expect(cast.available.value).toBe(true)
    remote.report!(false)
    expect(cast.available.value).toBe(false)
  })

  it('shows the button when the browser can only look for devices when asked', async () => {
    // A browser that can only look for devices when asked.
    const { cast } = setUp(new FakeRemote('NotSupportedError'))
    await settle()
    expect(cast.available.value).toBe(true)
  })

  it('stays hidden when remote playback is refused or missing', async () => {
    // A browser that refuses remote playback.
    const refused = setUp(new FakeRemote('InvalidStateError'))
    await settle()
    expect(refused.cast.available.value).toBe(false)

    // No API at all (e.g. Firefox): the button may still show on a phone, and says so when tapped.
    const missing = setUp(undefined)
    expect(missing.cast.available.value).toBe(false)
    expect(await missing.cast.prompt()).toEqual({ result: 'unsupported', detail: 'no Remote Playback API' })
  })

  it('follows the connection state', () => {
    // A browser that watches devices, and the composable on it.
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
    // The fake clock, read by the performance.now() spy.
    let clock = 0
    vi.spyOn(performance, 'now').mockImplementation(() => clock)
    // The fake device API, moving the clock as the picker stays open.
    const remote = new FakeRemote()
    remote.advance = (ms) => {
      clock += ms
    }
    // The composable on it.
    const { cast } = setUp(remote)

    expect((await cast.prompt()).result).toBe('done')
    // Closed by the user after looking at it: nothing to say.
    remote.promptError = 'NotAllowedError'
    expect((await cast.prompt()).result).toBe('cancelled')
    remote.promptError = 'NotFoundError'
    expect((await cast.prompt()).result).toBe('no-devices')
    remote.promptError = 'NotSupportedError'
    expect((await cast.prompt()).result).toBe('unsupported')
    remote.promptError = 'OperationError'
    expect((await cast.prompt()).result).toBe('failed')
  })

  it('takes an instant refusal for a browser that cannot cast (no picker was shown)', async () => {
    // The fake clock, read by the performance.now() spy.
    let clock = 0
    vi.spyOn(performance, 'now').mockImplementation(() => clock)
    // The fake device API, moving the clock as the picker stays open.
    const remote = new FakeRemote()
    remote.advance = (ms) => {
      clock += ms
    }
    remote.promptTakes = 5
    // The composable on it.
    const { cast } = setUp(remote)

    remote.promptError = 'NotAllowedError'
    expect((await cast.prompt()).result).toBe('unsupported')
  })

  it('passes on the answer the browser gave when it refused, with how quickly it came', async () => {
    // The fake clock, read by the performance.now() spy.
    let clock = 0
    vi.spyOn(performance, 'now').mockImplementation(() => clock)
    // The fake device API, its picker refusing with the browser's own message.
    const remote = new FakeRemote()
    remote.advance = (ms) => {
      clock += ms
    }
    remote.promptTakes = 12
    remote.prompt = function () {
      this.advance(this.promptTakes)
      return Promise.reject(new DOMException('The currentSrc is not compatible with remote playback', 'NotSupportedError'))
    }
    // The composable on it.
    const { cast } = setUp(remote)

    expect(await cast.prompt()).toEqual({
      result: 'unsupported',
      detail: 'NotSupportedError: The currentSrc is not compatible with remote playback (12 ms)',
    })
    // A cast that starts has nothing to report.
    remote.prompt = () => Promise.resolve()
    expect(await cast.prompt()).toEqual({ result: 'done', detail: null })
  })

  it('stops watching when the component goes away', async () => {
    // A browser that watches devices, and the composable on it.
    const remote = new FakeRemote()
    const { stop } = setUp(remote)
    await settle()
    // Spy on the listeners being removed.
    const listener = vi.spyOn(remote, 'removeEventListener')

    stop()
    expect(remote.cancelled).toEqual([7])
    expect(listener).toHaveBeenCalledTimes(3)
  })

  it('moves to a new element when it changes', async () => {
    // Two elements, each with its own device API, and the composable on the first.
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
