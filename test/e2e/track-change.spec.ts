/**
 * End-to-end, moving from one track to the next by itself: the gap between the end of a track
 * and the start of the next one, and when the next track's streaming address is asked for.
 *
 * The player asks for the next track's data and address ahead, a few seconds before the end
 * (lib/player/playback.ts, `prefetch`), so at the end it starts the next one at once, in the same
 * moment, without waiting for the network: shorter gaps, and a start the browser does not refuse
 * with the screen off (some refuse a play() that comes after a network wait in the background).
 *
 * Measured in the page, on one clock: the player's audio element is wrapped as it is created
 * (its `ended` and `playing` events), and so is `fetch` (the playback requests).
 */
import { expect, test, type Page } from '@playwright/test'
import { signUp, uploadTrack } from './helpers'

/** Simulated latency of the deployed API, per request (see the test). */
const API_LATENCY_MS = 500

/** One thing that happened in the page, at `t` ms on the page's clock. */
interface Mark {
  kind: 'ended' | 'playing' | 'request'
  t: number
  /** The requested URL (requests only). */
  url?: string
}

/** Wraps the audio element and fetch of every page loaded from now on, to record the marks. */
async function recordPlayback(page: Page) {
  await page.addInitScript(() => {
    const marks: Mark[] = []
    ;(window as unknown as { __marks: Mark[] }).__marks = marks
    // The player creates its one element with `new Audio()` on first play.
    const NativeAudio = window.Audio
    window.Audio = function (src?: string) {
      // The real element, with listeners recording when it starts and ends.
      const element = new NativeAudio(src)
      for (const kind of ['ended', 'playing'] as const) element.addEventListener(kind, () => marks.push({ kind, t: performance.now() }))
      return element
    } as unknown as typeof Audio
    // The API calls (the player's $fetch goes through fetch).
    const nativeFetch = window.fetch.bind(window)
    window.fetch = (input, init) => {
      // The requested address, whatever form fetch was given it in.
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      marks.push({ kind: 'request', t: performance.now(), url })
      return nativeFetch(input, init)
    }
  })
}

/** The marks recorded so far. */
function marksOf(page: Page): Promise<Mark[]> {
  return page.evaluate(() => (window as unknown as { __marks: Mark[] }).__marks)
}

test.describe('track change', () => {
  test('the next track starts at once, its address asked for before the end', async ({ page }) => {
    test.setTimeout(120_000)
    await signUp(page)
    // Three 8-second tracks: the library shows the newest first (Step 3, 2, 1).
    for (const title of ['Step 1', 'Step 2', 'Step 3']) await uploadTrack(page, title, { seconds: 8 })
    // Track ids by title, to recognise the next track's requests.
    const ids = await page.evaluate(async () => Object.fromEntries(
      (await (await fetch('/api/tracks')).json() as { id: string, title: string }[]).map(t => [t.title, t.id])))

    await recordPlayback(page)
    // The deployed app's API is far away (Vercel functions, sometimes cold): a local one answers
    // in a few ms, and would hide any wait. Each data or address request is held back 500 ms.
    await page.route(/\/api\/tracks\/[0-9a-f-]{36}(?:\/playback)?$/, async (route) => {
      await new Promise(resolve => setTimeout(resolve, API_LATENCY_MS))
      await route.continue()
    })
    await page.goto('/')
    // Play "Step 3": the queue is the library, so "Step 2" comes next.
    await page.getByTestId('track-row').filter({ hasText: 'Step 3' }).getByTestId('track-title').click()

    // Wait for the change: the first track's end, then the next one playing.
    await expect.poll(async () => {
      // Everything recorded so far.
      const marks = await marksOf(page)
      // The first track's end, once it came.
      const ended = marks.find(m => m.kind === 'ended')
      return !!ended && marks.some(m => m.kind === 'playing' && m.t > ended.t)
    }, { timeout: 30_000 }).toBe(true)

    // The whole record, now that the change happened.
    const marks = await marksOf(page)
    // The end of the first track…
    const ended = marks.find(m => m.kind === 'ended')!
    // …the next track playing after it…
    const started = marks.find(m => m.kind === 'playing' && m.t > ended.t)!
    // …and the request for the next track's address (ahead of the end, or after it).
    const asked = marks.find(m => m.kind === 'request' && m.url?.includes(`/api/tracks/${ids['Step 2']}/playback`))
    // The numbers, in the test's report (with 500 ms of latency the gap was ~555 ms before the
    // address was asked for ahead, ~40 ms after).
    test.info().annotations.push({
      type: 'track change',
      description: `gap ${Math.round(started.t - ended.t)} ms; next address asked ${asked ? Math.round(ended.t - asked.t) : '-'} ms before the end`,
    })

    // The next track's address was asked for before the end, not after it...
    expect(asked, 'the address of the next track is asked for').toBeDefined()
    expect(asked!.t).toBeLessThan(ended.t)
    // ...so the next track starts without any network wait: well under one request's latency.
    expect(started.t - ended.t).toBeLessThan(API_LATENCY_MS / 2)
  })
})
