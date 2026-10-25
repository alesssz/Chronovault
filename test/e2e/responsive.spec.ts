/**
 * End-to-end, touch screens: the phone and tablet layouts (Playwright projects `phone` and
 * `tablet`, see playwright.config.ts; the desktop project skips this file). No page scrolls
 * sideways, track covers show that they play without needing a hover, the tablet player bar
 * keeps a readable title and offers mute alone for the volume (the hardware buttons own it on a
 * touch screen), and on phones the lyrics
 * sync editor keeps Stamp line pinned above the player bar, keeps the screen on and vibrates.
 *
 * Phone-only device features, checked in Chromium with real touch events and a real
 * CloseWatcher, and with recorders standing in for what a headless browser cannot do (see
 * installDeviceProbes): swipes on the player bar and pull-down on the full-screen view, the
 * Android back button closing the panel on top, and links shared through the share sheet.
 * Also the lock-screen media card (the browser's real Media Session) and the Cast button,
 * against a stand-in for a Chromecast on the network (see installCastDevice) and with no
 * device at all (always shown on touch screens), and the phones' full-screen view: the
 * description under the controls, the lyrics in a view of their own.
 */
import { expect, test, type Locator, type Page } from '@playwright/test'
import { clickAndWaitForApi, signUp, uploadTrack } from './helpers'

// The edit page saves with PATCH /api/tracks/:id.
const SAVE_TRACK = { method: 'PATCH', path: /^\/api\/tracks\/[0-9a-f-]+$/ }

/** Pages of the signed-in app that must fit the screen width. */
const PAGES = ['/', '/playlists', '/versions', '/stats', '/tracks/new']

/** Fails when the page is wider than the screen (it would scroll sideways). */
async function expectNoSidewaysScroll(page: Page, path: string): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(scrollWidth, `${path} scrolls sideways`).toBeLessThanOrEqual(clientWidth)
}

/** Id of the signed-in user's first track (newest first). */
async function firstTrackId(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const tracks = await (await fetch('/api/tracks')).json() as { id: string }[]
    return tracks[0]!.id
  })
}

/**
 * A new user with one track, on the library. Called inside each test, after its
 * project check: a test skipped on this layout does not pay for the sign-up and upload.
 */
async function signUpWithTrack(page: Page): Promise<void> {
  await signUp(page)
  await uploadTrack(page, 'Touch screen song')
  await page.goto('/')
  await expect(page.getByTestId('track-row')).toHaveCount(1)
}

/** What the device probes recorded in the page (see installDeviceProbes). */
interface DeviceLog {
  /** Patterns passed to navigator.vibrate. */
  vibrations: (number | number[])[]
  /** Wake lock requests ('screen') and releases ('release'), in order. */
  wakeLocks: string[]
  /** Data passed to navigator.share. */
  shared: { title?: string, url?: string }[]
}

/**
 * Installs, before any page script runs, recorders for what a headless browser cannot do or
 * show: vibration, the screen wake lock and the share sheet are replaced by fakes that log
 * their calls (read with deviceLog). The real CloseWatcher is kept but wrapped, so a test can
 * play the Android back button on the newest active watcher (pressBack).
 */
async function installDeviceProbes(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const log: DeviceLog = { vibrations: [], wakeLocks: [], shared: [] }
    Object.assign(window, { __deviceLog: log })
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: (pattern: number | number[]) => {
        log.vibrations.push(pattern)
        return true
      },
    })
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: {
        request: async (type: string) => {
          log.wakeLocks.push(type)
          // A sentinel like the browser's: an event target that can be released once.
          const sentinel = Object.assign(new EventTarget(), {
            type,
            released: false,
            release: async () => {
              sentinel.released = true
              log.wakeLocks.push('release')
            },
          })
          return sentinel
        },
      },
    })
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data: { title?: string, url?: string }) => {
        log.shared.push(data)
      },
    })

    // The real CloseWatcher, wrapped to know which watchers are still active.
    type Watcher = EventTarget & { requestClose: () => void, destroy: () => void, spent?: boolean }
    const Native = (window as unknown as { CloseWatcher?: new () => Watcher }).CloseWatcher
    if (Native) {
      const watchers: Watcher[] = []
      Object.assign(window, { __closeWatchers: watchers })
      class TrackedCloseWatcher extends Native {
        constructor() {
          super()
          watchers.push(this)
          // Fired once: the watcher is spent afterwards.
          this.addEventListener('close', () => {
            this.spent = true
          })
        }

        override destroy() {
          this.spent = true
          super.destroy()
        }
      }
      Object.assign(window, { CloseWatcher: TrackedCloseWatcher })
    }
  })
}

/**
 * Pretends a Chromecast is on the network: every media element's `remote` (Remote Playback
 * API) reports a device at once, and its picker "connects" on the first prompt. Prompts are
 * counted in `window.__castPrompts`. A real device cannot be reached from a test browser.
 */
async function installCastDevice(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const prompts: number[] = []
    Object.assign(window, { __castPrompts: prompts })
    /** One fake RemotePlayback per element, like the browser's. */
    const remotes = new WeakMap<HTMLMediaElement, EventTarget>()
    Object.defineProperty(HTMLMediaElement.prototype, 'remote', {
      configurable: true,
      get(this: HTMLMediaElement) {
        let remote = remotes.get(this)
        if (!remote) {
          const fake = Object.assign(new EventTarget(), {
            state: 'disconnected',
            watchAvailability: async (callback: (available: boolean) => void) => {
              callback(true)
              return 1
            },
            cancelWatchAvailability: async () => {},
            prompt: async () => {
              prompts.push(Date.now())
              // The user picks the TV: connecting, then connected.
              fake.state = 'connecting'
              fake.dispatchEvent(new Event('connecting'))
              fake.state = 'connected'
              fake.dispatchEvent(new Event('connect'))
            },
          })
          remote = fake
          remotes.set(this, remote)
        }
        return remote
      },
    })
  })
}

/** What the probes recorded so far. */
async function deviceLog(page: Page): Promise<DeviceLog> {
  return page.evaluate(() => (window as unknown as { __deviceLog: DeviceLog }).__deviceLog)
}

/** The Android back button: a close request to the newest active CloseWatcher, as the system sends it. */
async function pressBack(page: Page): Promise<void> {
  await page.evaluate(() => {
    const watchers = (window as unknown as { __closeWatchers: { spent?: boolean, requestClose: () => void }[] }).__closeWatchers
    watchers.filter(w => !w.spent).at(-1)!.requestClose()
  })
}

/**
 * A finger swipe from the centre of `locator`, moved by (dx, dy) pixels in small steps, as
 * real touch events (Chrome DevTools Protocol): Playwright's touchscreen API only taps.
 */
async function swipe(page: Page, locator: Locator, dx: number, dy: number): Promise<void> {
  const box = (await locator.boundingBox())!
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
  const steps = 10
  for (let i = 1; i <= steps; i++) {
    const point = { x: x + (dx * i) / steps, y: y + (dy * i) / steps }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point] })
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach()
}

test.describe('touch screens', () => {
  test('pages fit the screen and covers show their play button', async ({ page }, testInfo) => {
    await signUpWithTrack(page)
    for (const path of PAGES) {
      await page.goto(path)
      // The header is there on every page: the page has rendered.
      await expect(page.getByRole('navigation', { name: 'Sections' })).toBeVisible()
      await expectNoSidewaysScroll(page, path)
    }

    // A smaller base size on phones (17px, more fits on a line); tablets keep the 20px of the desktop.
    const baseSize = await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)
    expect(baseSize).toBe(testInfo.project.name === 'phone' ? '17px' : '20px')

    // No hover on a touch screen: the play overlay is on even for a track that is not playing.
    await page.goto('/')
    await expect(page.getByTestId('track-cover-overlay')).toHaveCSS('opacity', '1')

    // The edit page (its tabs and lyrics tools) fits too.
    await page.goto(`/tracks/${await firstTrackId(page)}/edit`)
    await expect(page.getByRole('tab', { name: 'Sync' })).toBeVisible()
    await expectNoSidewaysScroll(page, '/tracks/[id]/edit')
    // Its header keeps room for the title: on phones Play, Download and Save are icons
    // (with their text the title shrank to a few letters).
    const heading = (await page.getByRole('heading', { level: 1 }).boundingBox())!
    expect(heading.width).toBeGreaterThan(150)
  })

  test('tablet: player bar with a readable title, and mute alone for the volume', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'tablet', 'tablet layout only')
    await signUpWithTrack(page)

    await page.getByTestId('track-title').tap()
    const bar = page.getByTestId('player-bar')
    await expect(bar).toBeVisible()
    // The two-row bar of md+: waveform and the full controls.
    await expect(bar.getByTestId('player-waveform')).toBeVisible()

    // The title column keeps a real width (it used to shrink to a few letters).
    const title = await bar.getByTestId('player-title').boundingBox()
    expect(title!.width).toBeGreaterThan(140)

    // A touch screen: the hardware buttons own the volume, so the bar offers mute alone (no
    // slider, and no popover button for one), and muting still works.
    await expect(bar.getByTestId('player-volume-compact')).toHaveCount(0)
    await expect(page.getByRole('slider', { name: 'Volume' })).toHaveCount(0)
    await bar.getByRole('button', { name: 'Mute' }).tap()
    await expect(bar.getByRole('button', { name: 'Unmute' })).toBeVisible()
  })

  test('phone: Stamp line stays pinned above the player bar while syncing', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'phone layout only')
    await installDeviceProbes(page)
    await signUpWithTrack(page)

    // Enough lyrics to make the page scroll, then the Sync tab with the track in the player.
    await page.goto(`/tracks/${await firstTrackId(page)}/edit`)
    await page.getByRole('tab', { name: 'Lyrics' }).tap()
    const lines = Array.from({ length: 30 }, (_, i) => `Line number ${i + 1}`)
    await page.getByTestId('field-lyrics').fill(lines.join('\n'))
    await page.getByRole('tab', { name: 'Sync' }).tap()
    await page.getByRole('button', { name: 'Load in player' }).tap()
    await page.getByRole('button', { name: 'Reload from lyrics' }).tap()

    // The desktop button gives way to the pinned bar.
    await expect(page.getByTestId('sync-stamp')).toBeHidden()
    const stamp = page.getByTestId('sync-stamp-mobile')
    await expect(stamp).toBeVisible()

    // Scrolled to the middle of the lines, the bar is still on screen, right above the player bar.
    await page.getByTestId('sync-row-text').nth(15).scrollIntoViewIfNeeded()
    await expect(stamp).toBeInViewport()
    const bar = await page.getByTestId('sync-stamp-bar').boundingBox()
    const player = await page.getByTestId('player-bar').boundingBox()
    expect(bar!.y + bar!.height).toBeLessThanOrEqual(player!.y)

    // While syncing, the screen is kept on.
    await expect.poll(async () => (await deviceLog(page)).wakeLocks).toEqual(['screen'])

    // A tap stamps the next line, with a short vibration; Undo vibrates twice.
    await stamp.tap()
    await expect(page.getByText('1 / 30 lines synced')).toBeVisible()
    await page.getByTestId('sync-stamp-bar').getByRole('button', { name: 'Undo' }).tap()
    await expect(page.getByText('0 / 30 lines synced')).toBeVisible()
    expect((await deviceLog(page)).vibrations).toEqual([15, [10, 60, 10]])

    // Leaving the Sync tab lets the screen go back to its usual timeout.
    await page.getByRole('tab', { name: 'Lyrics' }).tap()
    await expect.poll(async () => (await deviceLog(page)).wakeLocks).toEqual(['screen', 'release'])
  })

  test('phone: swipes change track and open the player; a pull-down closes it', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'phone layout only')
    await signUp(page)
    // Long enough not to end during the test (the queue would move on by itself).
    await uploadTrack(page, 'Older song', { seconds: 30 })
    // A long title: the full-screen view must truncate it, not grow wider than the screen.
    const newer = 'Newer song with a title far too long to fit on a phone screen'
    await uploadTrack(page, newer, { seconds: 30 })
    await page.goto('/')
    await expect(page.getByTestId('track-row')).toHaveCount(2)

    // Newest first: playing the first row queues both, "Older song" next.
    await page.getByTestId('track-title').first().tap()
    const bar = page.getByTestId('player-bar')
    const title = bar.getByTestId('player-title')
    const trackArea = bar.getByTestId('player-track-area')
    await expect(title).toHaveText(newer)

    // Swipe left: the next track.
    await swipe(page, trackArea, -150, 0)
    await expect(title).toHaveText('Older song')
    // Paused right away, so "previous" goes back a track instead of restarting this one (after 3 s).
    await bar.getByRole('button', { name: 'Pause' }).tap()
    // Swipe right: the previous track.
    await swipe(page, trackArea, 150, 0)
    await expect(title).toHaveText(newer)

    // Swipe up: the full-screen view.
    await swipe(page, trackArea, 0, -150)
    const expanded = page.getByTestId('player-expanded')
    await expect(expanded).toBeVisible()
    // It fits the screen even with the long title (its column once grew to the title's width).
    const heading = (await expanded.getByRole('heading', { name: newer }).boundingBox())!
    expect(heading.x + heading.width).toBeLessThanOrEqual(page.viewportSize()!.width)

    // Pull it down from its top: it closes.
    await swipe(page, expanded.getByText('Now playing'), 0, 300)
    await expect(expanded).toBeHidden()
  })

  test('phone: the back button closes the panel on top first', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'phone layout only')
    await installDeviceProbes(page)
    await signUpWithTrack(page)

    // The full-screen view, then Up next on top of it.
    await page.getByTestId('track-title').tap()
    await page.getByTestId('player-track-area').tap()
    const expanded = page.getByTestId('player-expanded')
    await expect(expanded).toBeVisible()
    await expanded.getByRole('button', { name: 'Up next' }).tap()
    const queue = page.getByRole('dialog', { name: 'Up next' })
    await expect(queue).toBeVisible()

    // Back closes Up next only; back again closes the full-screen view; the page stays.
    await pressBack(page)
    await expect(queue).toBeHidden()
    await expect(expanded).toBeVisible()
    await pressBack(page)
    await expect(expanded).toBeHidden()
    await expect(page.getByRole('heading', { name: 'Your library', exact: true })).toBeVisible()
  })

  test('phone: the lock screen shows the track and the app; Cast reaches a TV', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'phone layout only')
    await installCastDevice(page)
    await signUpWithTrack(page)
    await page.getByTestId('track-title').tap()
    await expect(page.getByTestId('player-title')).toHaveText('Touch screen song')

    // The media card (lock screen, notification): the title, and the app where the track
    // has no composers, album or cover.
    const card = await page.evaluate(() => {
      const metadata = navigator.mediaSession.metadata!
      return { title: metadata.title, artist: metadata.artist, album: metadata.album, artwork: metadata.artwork.map(a => a.src) }
    })
    expect(card.title).toBe('Touch screen song')
    expect(card.artist).toBe('ChronoPlayer')
    expect(card.album).toBe('ChronoPlayer')
    expect(card.artwork[0]).toMatch(/^http.*\/pwa-192x192\.png$/)

    // Cast: on phones it is in the full-screen view; a tap opens the device picker, and the
    // button shows the connection.
    await page.getByTestId('player-track-area').tap()
    const castButton = page.getByTestId('player-expanded').getByTestId('player-cast')
    await expect(castButton).toHaveAttribute('data-state', 'disconnected')
    await castButton.tap()
    await expect(castButton).toHaveAttribute('data-state', 'connected')
    await expect(castButton).toHaveAccessibleName('Casting: stop or change device')
    expect(await page.evaluate(() => (window as unknown as { __castPrompts: number[] }).__castPrompts.length)).toBe(1)
  })

  test('touch screens: the Cast button is always there, and explains when casting is not possible', async ({ page }, testInfo) => {
    await signUpWithTrack(page)
    await page.getByTestId('track-title').tap()

    // Phones reach it in the full-screen view, tablets in the player bar.
    let castButton = page.getByTestId('player-bar').getByTestId('player-cast')
    if (testInfo.project.name === 'phone') {
      await page.getByTestId('player-track-area').tap()
      castButton = page.getByTestId('player-expanded').getByTestId('player-cast')
    }
    // No device on the network (a test browser finds none): still there, as in phone music apps.
    await expect(castButton).toBeVisible()

    // This headless browser has no device picker, so it refuses at once, like a browser
    // that cannot cast (e.g. Opera on Android): a message says so, with the browser's own
    // answer (on a real phone, the clue to why).
    await castButton.tap()
    await expect(page.getByText('Casting is not available here').first()).toBeVisible()
    await expect(page.getByText(/Browser's answer: NotAllowedError/).first()).toBeVisible()
  })

  test('phone: the full-screen view shows the description; Lyrics opens the lyrics view', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'phone layout only')
    await installDeviceProbes(page)
    await signUpWithTrack(page)
    const id = await firstTrackId(page)

    // A track without lyrics or description: the view has neither, and no Lyrics button.
    await page.getByTestId('track-title').tap()
    await page.getByTestId('player-track-area').tap()
    const expanded = page.getByTestId('player-expanded')
    await expect(expanded).toBeVisible()
    // On opening the view itself takes the focus, not its first button, whose tooltip
    // ("Collapse player") used to open by itself over the cover.
    await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-testid'))).toBe('player-expanded')
    await expect(page.getByRole('tooltip')).toHaveCount(0)
    await expect(expanded.getByTestId('player-lyrics-toggle')).toHaveCount(0)
    await expect(expanded.getByTestId('player-description')).toHaveCount(0)

    // Description and 30 synced lines (enough to scroll), then a reload: the saved queue
    // brings the track back with its new data.
    await page.evaluate(async (trackId) => {
      const lyricsSynced = Array.from({ length: 30 }, (_, i) => ({ time: i * 2, text: `Sung line ${i + 1}` }))
      const response = await fetch(`/api/tracks/${trackId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          description: 'Written on a rainy night.',
          lyrics: lyricsSynced.map(line => line.text).join('\n'),
          lyricsSynced,
        }),
      })
      if (!response.ok) throw new Error(`PATCH failed: ${response.status}`)
    }, id)
    await page.reload()
    await page.getByTestId('player-track-area').tap()
    await expect(expanded).toBeVisible()

    // Normal view: the description under the controls, the lyrics not there.
    await expect(expanded.getByTestId('player-description')).toContainText('Written on a rainy night.')
    await expect(expanded.getByTestId('lyrics-synced')).toHaveCount(0)

    // Lyrics: the lyrics view, with the controls still at hand.
    const toggle = expanded.getByTestId('player-lyrics-toggle')
    await toggle.tap()
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    const lyricsView = expanded.getByTestId('player-lyrics-view')
    await expect(lyricsView.getByTestId('lyrics-synced')).toBeVisible()
    await expect(lyricsView.getByRole('button', { name: /^(Play|Pause)$/ })).toBeVisible()
    await expect(expanded.getByTestId('player-description')).toHaveCount(0)

    // The lyrics scroll inside their own box; the view itself fits the screen.
    const box = await lyricsView.getByTestId('lyrics-synced').evaluate((list) => {
      const scroller = list.parentElement!
      return { scrollHeight: scroller.scrollHeight, clientHeight: scroller.clientHeight }
    })
    expect(box.scrollHeight).toBeGreaterThan(box.clientHeight)
    const viewBox = (await lyricsView.boundingBox())!
    expect(viewBox.y + viewBox.height).toBeLessThanOrEqual(page.viewportSize()!.height)

    // The screen stays on while reading along with the music: not while paused (the reload
    // brought the track back paused), yes once playing, and no longer after a pause.
    expect((await deviceLog(page)).wakeLocks).toEqual([])
    await lyricsView.getByRole('button', { name: 'Play' }).tap()
    await expect.poll(async () => (await deviceLog(page)).wakeLocks).toEqual(['screen'])
    await lyricsView.getByRole('button', { name: 'Pause' }).tap()
    await expect.poll(async () => (await deviceLog(page)).wakeLocks).toEqual(['screen', 'release'])

    // Remembered on the device: after a reload the full-screen view opens on the lyrics.
    await page.reload()
    await page.getByTestId('player-track-area').tap()
    await expect(expanded.getByTestId('player-lyrics-view')).toBeVisible()

    // Off again: back to the normal view.
    await expanded.getByTestId('player-lyrics-toggle').tap()
    await expect(expanded.getByTestId('player-lyrics-view')).toHaveCount(0)
    await expect(expanded.getByTestId('player-description')).toBeVisible()
  })

  test('phone: share links open the share sheet', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'phone layout only')
    await installDeviceProbes(page)
    await signUpWithTrack(page)

    // An unlisted track has a public link.
    await page.goto(`/tracks/${await firstTrackId(page)}/edit`)
    await page.getByText('Unlisted', { exact: true }).tap()
    await clickAndWaitForApi(page, page.getByTestId('save-track'), SAVE_TRACK)

    // The share box: "Share link" hands title and link to the share sheet.
    const share = page.getByTestId('share-box').getByTestId('copy-share-link')
    await expect(share).toHaveText('Share link')
    await share.tap()
    await expect.poll(async () => (await deviceLog(page)).shared).toHaveLength(1)
    const [sent] = (await deviceLog(page)).shared
    expect(sent!.title).toBe('Touch screen song')
    expect(sent!.url).toMatch(/\/t\/[0-9a-f-]{36}$/)

    // The library menu does the same (a new page load: the log starts empty again).
    await page.goto('/')
    await page.getByRole('button', { name: 'Actions for Touch screen song' }).tap()
    await page.getByRole('menuitem', { name: 'Share link' }).tap()
    await expect.poll(async () => (await deviceLog(page)).shared).toEqual([sent])
  })
})
