/**
 * End-to-end, touch screens: the phone and tablet layouts (Playwright projects `phone` and
 * `tablet`, see playwright.config.ts; the desktop project skips this file). No page scrolls
 * sideways, track covers keep their play overlay for the current track only, the tablet player bar
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
 *
 * Layout regressions found by measuring the pages: the header's section links never slide under
 * "Add" (they did from 640 to about 890px), the library's search box keeps a readable width (it
 * shrank to its icon), and on a short phone the full-screen view and a track's share page keep
 * their play button in the first screen; the full-screen view's ✕ closes the player, the phones'
 * only way to. On phones the library's selection bar sits at the bottom with each action named,
 * the versions of a song keep the end of their titles, and statistics keep their titles readable.
 * Also on phones: the track editor starts with its form (the cover a small row above it) and
 * brings up a Save bar while there is something to save, a playlist's page with its tracks, and
 * the library's filters live in a panel. On both touch layouts a long press on a library row
 * starts selecting, and the selection bar's ✕ ends it. On tablets the selection bar keeps its
 * count whole and each action's short name on one line, and the editors (a group of versions,
 * a track) put the cover in a row above the content, which gets the whole width.
 */
import { expect, test, type Locator, type Page } from './fixtures'
import { clickAndWaitForApi, signUp, uploadTrack, waitForHydration } from './helpers'

// The edit page saves with PATCH /api/tracks/:id.
const SAVE_TRACK = { method: 'PATCH', path: /^\/api\/tracks\/[0-9a-f-]+$/ }

/** Pages of the signed-in app that must fit the screen width. */
const PAGES = ['/', '/playlists', '/versions', '/stats', '/tracks/new']

/** Fails when the page is wider than the screen (it would scroll sideways). */
async function expectNoSidewaysScroll(page: Page, path: string): Promise<void> {
  // The page's full width and the visible width, measured in the page.
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(scrollWidth, `${path} scrolls sideways`).toBeLessThanOrEqual(clientWidth)
}

/** Id of the signed-in user's first track (newest first). */
async function firstTrackId(page: Page): Promise<string> {
  return page.evaluate(async () => {
    // The new account's tracks.
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
    // What the probes record, read back by deviceLog().
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
    // The browser's own CloseWatcher, if it has one.
    const Native = (window as unknown as { CloseWatcher?: new () => Watcher }).CloseWatcher
    if (Native) {
      // Every watcher made since the page loaded, spent ones marked.
      const watchers: Watcher[] = []
      Object.assign(window, { __closeWatchers: watchers })
      // The real watcher, recorded as it is made.
      class TrackedCloseWatcher extends Native {
        // Creates the real watcher and keeps track of it.
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
    // When the app asked for the device picker (one entry per prompt).
    const prompts: number[] = []
    Object.assign(window, { __castPrompts: prompts })
    /** One fake RemotePlayback per element, like the browser's. */
    const remotes = new WeakMap<HTMLMediaElement, EventTarget>()
    Object.defineProperty(HTMLMediaElement.prototype, 'remote', {
      configurable: true,
      // The element's fake RemotePlayback, made on first use.
      get(this: HTMLMediaElement) {
        // The one already made for this element, if any.
        let remote = remotes.get(this)
        if (!remote) {
          // A device is around and accepts the connection at once.
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
    // Every watcher made so far (the probes recorded them).
    const watchers = (window as unknown as { __closeWatchers: { spent?: boolean, requestClose: () => void }[] }).__closeWatchers
    watchers.filter(w => !w.spent).at(-1)!.requestClose()
  })
}

/**
 * A finger swipe from the centre of `locator`, moved by (dx, dy) pixels in small steps, as
 * real touch events (Chrome DevTools Protocol): Playwright's touchscreen API only taps.
 */
async function swipe(page: Page, locator: Locator, dx: number, dy: number): Promise<void> {
  // Where the element is on screen.
  const box = (await locator.boundingBox())!
  // Its center: where the finger lands.
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  // The DevTools protocol, to send real touch events.
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
  // The movement in ten steps, like a real finger.
  const steps = 10
  for (let i = 1; i <= steps; i++) {
    // Where the finger is at this step.
    const point = { x: x + (dx * i) / steps, y: y + (dy * i) / steps }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point] })
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach()
}

/**
 * A finger held on the centre of `locator` for `ms`, as real touch events (Chrome DevTools
 * Protocol). With `drift`, the finger first moves that far down in small steps, as when a slow
 * scroll starts, then stays there for the rest of the time.
 */
async function hold(page: Page, locator: Locator, ms: number, drift = 0): Promise<void> {
  // Where the element is on screen.
  const box = (await locator.boundingBox())!
  // Its center: where the finger lands.
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  // The DevTools protocol, to send real touch events.
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
  for (let i = 1; i <= 5 && drift; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + (drift * i) / 5 }] })
  }
  await page.waitForTimeout(ms)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach()
}

test.describe('touch screens', () => {
  test('pages fit the screen, and covers show play only on the current track', async ({ page }, testInfo) => {
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

    await page.goto('/')
    // The header's left group (logo, section links) ends before "Add" starts: from 640px the
    // section names used to slide under it, up to about 890px (the tablet is 820px wide).
    const sections = (await page.getByRole('navigation', { name: 'Sections' }).boundingBox())!
    const add = (await page.locator('header a[href="/tracks/new"]').filter({ visible: true }).boundingBox())!
    expect(sections.x + sections.width).toBeLessThanOrEqual(add.x)
    // The search box leaves room to read what is typed: beside the filters it shrank to its
    // icon (58px) from 640px; it now has a row of its own below 1280px, shared on phones only
    // with the Filters button.
    const search = (await page.getByRole('textbox', { name: 'Search the library' }).boundingBox())!
    expect(search.width).toBeGreaterThan(testInfo.project.name === 'phone' ? 220 : 300)

    // A touch screen has no hover: a track that is not playing shows its cover, without the play
    // overlay (on every cover it darkened the whole list; a tap on the row plays already).
    await expect(page.getByTestId('track-cover-overlay')).toHaveCSS('opacity', '0')

    // The edit page (its tabs and lyrics tools) fits too.
    await page.goto(`/tracks/${await firstTrackId(page)}/edit`)
    await expect(page.getByRole('tab', { name: 'Sync' })).toBeVisible()
    await expectNoSidewaysScroll(page, '/tracks/[id]/edit')
    // Its header keeps room for the title: on phones Play and Download are icons and Save is in
    // the Save bar (with their text the title shrank to a few letters).
    const heading = (await page.getByRole('heading', { level: 1 }).boundingBox())!
    expect(heading.width).toBeGreaterThan(150)
  })

  test('tablet: player bar with a readable title, and mute alone for the volume', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'tablet', 'tablet layout only')
    await signUpWithTrack(page)

    await page.getByTestId('track-title').tap()
    // The player bar.
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

  test('tablet: the selection bar fits one line; editors give their content the whole width', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'tablet', 'tablet layout only')
    test.setTimeout(90_000)
    await signUp(page)
    // Two versions of a song: titles alike up to the part that tells them apart.
    const versions = ['Teutoburg forest, first version with female vocals', 'Teutoburg forest, second version with male choir']
    for (const title of versions) await uploadTrack(page, title)
    await page.goto('/')
    await expect(page.getByTestId('track-row')).toHaveCount(2)

    // --- Selection bar (UI-28): the count whole, each action's short name on one line ---
    await page.getByTestId('select-mode').tap()
    for (const title of await page.getByTestId('track-title').all()) await title.tap()
    const bar = page.getByTestId('selection-bar')
    const count = page.getByTestId('selection-count')
    await expect(count).toHaveText('2 selected')
    // It used to read "2 sel…".
    expect(await count.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
    for (const name of ['Final', 'Playlist', 'Feedback', 'Delete']) {
      const label = bar.getByText(name, { exact: true })
      await expect(label).toBeVisible()
      // One box per line: "Mark / final" over two lines gave two.
      expect(await label.evaluate(el => el.getClientRects().length), `${name} wraps`).toBe(1)
    }

    // --- Group of versions (UI-27): the cover a row above, the list across the page ---
    const ids = await page.evaluate(async () => {
      // The two versions, oldest first.
      const tracks = await (await fetch('/api/tracks')).json() as { id: string }[]
      return tracks.map(track => track.id).reverse()
    })
    const groupId = await page.evaluate(async (trackIds) => {
      const response = await fetch('/api/playlists', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Teutoburg forest', trackIds, purpose: 'versions' }),
      })
      return (await response.json() as { id: string }).id
    }, ids)
    await page.goto(`/versions/${groupId}`)
    const rows = page.getByTestId('playlist-track')
    await expect(rows).toHaveCount(2)
    const width = page.viewportSize()!.width
    const cover = (await page.getByRole('button', { name: 'Add cover' }).boundingBox())!
    const row = (await rows.first().boundingBox())!
    expect(row.y).toBeGreaterThan(cover.y + cover.height)
    // Beside a 16rem column the list kept about 400px of the 820.
    expect(row.width).toBeGreaterThan(width * 0.8)
    // Each title whole: in 400px they broke mid-word ("Teutob / urg") and were cut at two lines.
    for (const title of versions) {
      const text = rows.getByText(title, { exact: true })
      const cut = await text.evaluate(el => el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight)
      expect(cut, `${title} is cut`).toBe(false)
    }

    // --- Track editor (UI-27): the form across the page too, under the cover row ---
    await page.goto(`/tracks/${ids[0]}/edit`)
    const form = (await page.locator('#track-form').boundingBox())!
    expect(form.width).toBeGreaterThan(width * 0.8)
  })

  test('phone: Stamp line stays pinned above the player bar while syncing', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'phone layout only')
    await installDeviceProbes(page)
    await signUpWithTrack(page)

    // Enough lyrics to make the page scroll, then the Sync tab with the track in the player.
    await page.goto(`/tracks/${await firstTrackId(page)}/edit`)
    await page.getByRole('tab', { name: 'Lyrics' }).tap()
    // Thirty lines: more than a phone screen holds.
    const lines = Array.from({ length: 30 }, (_, i) => `Line number ${i + 1}`)
    await page.getByTestId('field-lyrics').fill(lines.join('\n'))
    await page.getByRole('tab', { name: 'Sync' }).tap()
    await page.getByRole('button', { name: 'Load in player' }).tap()
    await page.getByRole('button', { name: 'Reload from lyrics' }).tap()

    // The desktop button gives way to the pinned bar.
    await expect(page.getByTestId('sync-stamp')).toBeHidden()
    // The phones' Stamp line button, pinned above the player bar.
    const stamp = page.getByTestId('sync-stamp-mobile')
    await expect(stamp).toBeVisible()

    // Scrolled to the middle of the lines, the bar is still on screen, right above the player bar,
    // and above the Save bar the typed lyrics brought up (it never covers Stamp line).
    await page.getByTestId('sync-row-text').nth(15).scrollIntoViewIfNeeded()
    await expect(stamp).toBeInViewport()
    // Where the pinned bar, the Save bar and the player bar are on screen.
    const bar = await page.getByTestId('sync-stamp-bar').boundingBox()
    const saveBar = await page.getByTestId('save-bar').boundingBox()
    const player = await page.getByTestId('player-bar').boundingBox()
    expect(bar!.y + bar!.height).toBeLessThanOrEqual(saveBar!.y)
    expect(saveBar!.y + saveBar!.height).toBeLessThanOrEqual(player!.y + 1)

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
    // The player bar, its title and its track area (where the swipes go).
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
    // The full-screen view.
    const expanded = page.getByTestId('player-expanded')
    await expect(expanded).toBeVisible()
    // It fits the screen even with the long title (its column once grew to the title's width).
    const heading = (await expanded.getByRole('heading', { name: newer }).boundingBox())!
    expect(heading.x + heading.width).toBeLessThanOrEqual(page.viewportSize()!.width)

    // Pull it down from its top: it closes.
    await swipe(page, expanded.getByText('Now playing'), 0, 300)
    await expect(expanded).toBeHidden()
  })

  test('phone: the full-screen view closes the player, and a short screen keeps play in view', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'phone layout only')
    await signUpWithTrack(page)
    // The track, shared below.
    const id = await firstTrackId(page)
    // An iPhone SE with Safari's bars showing: about 375×548 of page.
    const height = 548
    await page.setViewportSize({ width: 375, height })

    await page.getByTestId('track-title').tap()
    await page.getByTestId('player-track-area').tap()
    // The full-screen view.
    const expanded = page.getByTestId('player-expanded')
    await expect(expanded).toBeVisible()
    // Play is in the first screen: the cover shrinks with the height (a full-width cover used
    // to push the controls under the bottom edge).
    const play = (await expanded.getByTestId('player-toggle').boundingBox())!
    expect(play.y + play.height).toBeLessThanOrEqual(height)

    // The ✕ of its top bar closes the player (the phone bar has no room for one): view and bar go.
    await expanded.getByRole('button', { name: 'Close player' }).tap()
    await expect(expanded).toBeHidden()
    await expect(page.getByTestId('player-bar')).toHaveCount(0)

    // The track's share page: its Play button is in the first screen too.
    await page.evaluate(async (trackId) => {
      await fetch(`/api/tracks/${trackId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ visibility: 'unlisted' }),
      })
    }, id)
    await page.goto(`/t/${id}`)
    await waitForHydration(page)
    // The page's big Play button.
    const sharedPlay = page.getByTestId('shared-play')
    const box = (await sharedPlay.boundingBox())!
    expect(box.y + box.height).toBeLessThanOrEqual(height)
    // A share page's full-screen view has no Close player: the player belongs to the page.
    await sharedPlay.tap()
    await page.getByTestId('shared-expand').tap()
    await expect(expanded).toBeVisible()
    await expect(expanded.getByRole('button', { name: 'Collapse player' })).toBeVisible()
    await expect(expanded.getByRole('button', { name: 'Close player' })).toHaveCount(0)
  })

  test('phone: selecting acts from the bottom; versions and statistics keep their titles', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'phone layout only')
    test.setTimeout(90_000)
    await installDeviceProbes(page)
    await signUp(page)
    // Two versions of a song: titles too long for one line, alike up to the part that tells them apart.
    const versions = ['Teutoburg forest, first version with female vocals', 'Teutoburg forest, second version with male choir']
    for (const title of versions) await uploadTrack(page, title)
    await page.goto('/')
    await expect(page.getByTestId('track-row')).toHaveCount(2)

    // Selection mode: the bar is at the bottom of the screen, every action named under its icon
    // (tooltips do not open on touch, and the bare icons had to be guessed).
    await page.getByTestId('select-mode').tap()
    const bar = page.getByTestId('selection-bar')
    const height = page.viewportSize()!.height
    const box = (await bar.boundingBox())!
    expect(Math.abs(box.y + box.height - height)).toBeLessThanOrEqual(1)
    for (const name of ['Final', 'Playlist', 'Feedback', 'Delete']) {
      await expect(bar.getByText(name, { exact: true })).toBeVisible()
    }
    // Both versions, shared for feedback from the bar: the share sheet gets the group's link.
    for (const title of await page.getByTestId('track-title').all()) await title.tap()
    await expect(page.getByTestId('selection-count')).toHaveText('2 selected')
    await bar.getByTestId('bulk-feedback').tap()
    await expect.poll(async () => (await deviceLog(page)).shared).toHaveLength(1)
    const groupUrl = (await deviceLog(page)).shared[0]!.url!

    // The group's share page: each title whole, on two lines (cut at the end of one line, both
    // read "Teutoburg forest, …"); the WIP badge and the duration, alike on every row, give way.
    await page.goto(groupUrl)
    for (const title of versions) {
      const row = page.getByTestId('shared-playlist-track').filter({ hasText: title })
      const text = row.getByText(title, { exact: true })
      const cut = await text.evaluate(el => el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight)
      expect(cut, `${title} is cut`).toBe(false)
      await expect(row.getByTestId('shared-track-wip')).toBeHidden()
    }

    // Statistics: the numbers go under the title, which keeps the row's width (beside them it
    // kept about 8 characters).
    await page.goto('/stats')
    const item = page.getByTestId('stats-item').first()
    const link = (await item.getByRole('link').boundingBox())!
    const plays = (await item.getByTestId('stats-item-plays').boundingBox())!
    expect(plays.y).toBeGreaterThanOrEqual(link.y + link.height)
    expect(link.width).toBeGreaterThan(200)
  })

  test('touch screens: a long press on a row starts selecting; a moving finger does not', async ({ page }) => {
    test.setTimeout(90_000)
    await installDeviceProbes(page)
    await signUp(page)
    for (const title of ['Held first', 'Held second']) await uploadTrack(page, title)
    await page.goto('/')
    const rows = page.getByTestId('track-row')
    await expect(rows).toHaveCount(2)
    const bar = page.getByTestId('selection-bar')

    // A finger that moves as it presses is a scroll starting: nothing selected.
    await hold(page, rows.nth(0).getByTestId('track-title'), 700, 40)
    await expect(bar).toBeHidden()

    // Held still: selection mode, that track ticked, a short vibration; the finger's release is
    // not a tap (it would have played the track, or unticked it).
    await hold(page, rows.nth(0).getByTestId('track-title'), 700)
    await expect(bar).toBeVisible()
    await expect(page.getByTestId('selection-count')).toHaveText('1 selected')
    await expect(rows.nth(0).getByTestId('track-select')).toBeChecked()
    expect((await deviceLog(page)).vibrations).toEqual([15])
    await expect(page.getByTestId('player-bar')).toHaveCount(0)
    // Nothing plays: no play icon over its cover. On phones the press focuses the row's title, and
    // focus showed one (for keyboard users; a touch is not the keyboard). The overlay fades in:
    // its transition is finished at once, so the opacity read is where it is heading, not a
    // frame of the fade (which read 0 at the start of a fade towards 1).
    const overlay = await rows.nth(0).getByTestId('track-cover-overlay').evaluate((element) => {
      for (const animation of element.getAnimations()) animation.finish()
      return getComputedStyle(element).opacity
    })
    expect(overlay).toBe('0')

    // Held on another row while selecting: ticked too, the first one kept.
    await hold(page, rows.nth(1).getByTestId('track-title'), 700)
    await expect(page.getByTestId('selection-count')).toHaveText('2 selected')

    // The ✕ leading the bar ends selecting, within reach where "Done" is not.
    await bar.getByTestId('selection-close').tap()
    await expect(bar).toBeHidden()
    await expect(page.getByTestId('track-select')).toHaveCount(0)
  })

  test('phone: editors start with what they edit and keep Save within reach; filters live in a panel', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'phone layout only')
    await signUpWithTrack(page)
    const height = page.viewportSize()!.height

    // --- Library: search and a Filters button; the four choices in a panel ---
    await expect(page.getByRole('combobox', { name: 'Filter by genre' })).toBeHidden()
    const list = (await page.getByTestId('track-row').first().boundingBox())!
    // The first track right under the search row (the 2×2 filters put it about 270px lower).
    const search = (await page.getByRole('textbox', { name: 'Search the library' }).boundingBox())!
    expect(list.y - (search.y + search.height)).toBeLessThan(60)
    await page.getByTestId('filters-open').tap()
    const panel = page.getByRole('dialog', { name: 'Filters' })
    await expect(panel).toBeVisible()
    // Final versions only: the new upload is a draft, so the list empties; the button counts one filter.
    await panel.getByRole('combobox', { name: 'Filter by version' }).tap()
    await page.getByRole('option', { name: 'Final' }).tap()
    await expect(panel.getByTestId('filters-done')).toHaveText('Show 0 tracks')
    await panel.getByTestId('filters-done').tap()
    await expect(panel).toBeHidden()
    await expect(page.getByTestId('filters-count')).toHaveText('1')
    await expect(page.getByTestId('library-count')).toHaveText('0 of 1 track')
    // Clear in the panel brings the track back.
    await page.getByTestId('filters-open').tap()
    await panel.getByTestId('filters-clear').tap()
    await panel.getByTestId('filters-done').tap()
    await expect(page.getByTestId('track-row')).toHaveCount(1)
    await expect(page.getByTestId('library-count')).toHaveText('1 track')
    await expect(page.getByTestId('filters-count')).toHaveCount(0)
    // The account menu: no "Keyboard shortcuts" on a touch screen, usually without a keyboard.
    await page.getByRole('button', { name: 'User menu' }).tap()
    await expect(page.getByRole('menuitem', { name: 'Storage' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Keyboard shortcuts' })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menuitem', { name: 'Storage' })).toBeHidden()

    // --- Track editor: the form in the first screen, Save at the bottom while there are changes ---
    const id = await firstTrackId(page)
    await page.goto(`/tracks/${id}/edit`)
    const title = page.getByTestId('field-title')
    await expect(title).toBeVisible()
    // Under the small cover row, not two screens down.
    const field = (await title.boundingBox())!
    expect(field.y + field.height).toBeLessThanOrEqual(height)
    // Sharing and Delete come after the form.
    const description = (await page.getByTestId('field-description').boundingBox())!
    const remove = (await page.getByRole('button', { name: 'Delete track' }).boundingBox())!
    expect(remove.y).toBeGreaterThan(description.y)
    // Album and year share a row (a row each made the form a screen longer), each half of it.
    const [album, year] = await Promise.all(['Album', 'Year'].map(label => page.locator('form label', { hasText: new RegExp(`^${label}`) })
      .locator('xpath=ancestor::*[@data-slot="root"][1]').boundingBox()))
    expect(year!.y).toBe(album!.y)
    expect(Math.abs(year!.width - album!.width)).toBeLessThanOrEqual(1)
    // Nothing to save: no bar. An edit brings it up, at the bottom of the screen.
    const saveBar = page.getByTestId('save-bar')
    await expect(saveBar).toHaveCount(0)
    await title.fill('Touch screen song, renamed')
    await expect(saveBar).toBeVisible()
    const bar = (await saveBar.boundingBox())!
    expect(Math.abs(bar.y + bar.height - height)).toBeLessThanOrEqual(1)
    // Its Save saves the form, from the end of the page too; then the bar goes.
    await page.getByRole('button', { name: 'Delete track' }).scrollIntoViewIfNeeded()
    await clickAndWaitForApi(page, saveBar.getByRole('button', { name: 'Save' }), SAVE_TRACK)
    await expect(saveBar).toHaveCount(0)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Touch screen song, renamed')

    // --- Playlist page: the tracks in the first screen; its details in a dialog ---
    const playlistId = await page.evaluate(async (trackId) => {
      const response = await fetch('/api/playlists', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Phone playlist', trackIds: [trackId] }),
      })
      return (await response.json() as { id: string }).id
    }, id)
    await page.goto(`/playlists/${playlistId}`)
    const row = (await page.getByTestId('playlist-track').first().boundingBox())!
    expect(row.y + row.height).toBeLessThanOrEqual(height)
    await page.getByRole('button', { name: 'Edit details' }).tap()
    const details = page.getByRole('dialog', { name: 'Edit playlist details' })
    await details.getByTestId('playlist-field-title').fill('Phone playlist, renamed')
    await clickAndWaitForApi(page, details.getByTestId('save-playlist'), { method: 'PATCH', path: /^\/api\/playlists\/[0-9a-f-]+$/ })
    await expect(details).toBeHidden()
    await expect(page.getByTestId('playlist-title')).toHaveText('Phone playlist, renamed')
  })

  test('phone: the back button closes the panel on top first', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'phone layout only')
    await installDeviceProbes(page)
    await signUpWithTrack(page)

    // The full-screen view, then Up next on top of it.
    await page.getByTestId('track-title').tap()
    await page.getByTestId('player-track-area').tap()
    // The full-screen view.
    const expanded = page.getByTestId('player-expanded')
    await expect(expanded).toBeVisible()
    await expanded.getByRole('button', { name: 'Up next' }).tap()
    // The Up next panel, a dialog over the view.
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

    // The bar's title does not mean the card is set. The bar shows the track as soon as it
    // is chosen (`displayTrack`), while the card follows `player.current`
    // (plugins/media-session.client.ts), set only once the track's data and streaming
    // address are in: read at once, the card was still empty about two runs in three.
    // Poll the card itself (`null` until set), so the read below finds it filled.
    await expect.poll(() => page.evaluate(() => navigator.mediaSession.metadata?.title ?? null))
      .toBe('Touch screen song')

    // The media card (lock screen, notification): the title, and the app's name and its
    // artwork where the track has no composers, album or cover.
    const card = await page.evaluate(() => {
      const metadata = navigator.mediaSession.metadata!
      return { title: metadata.title, artist: metadata.artist, album: metadata.album, artwork: metadata.artwork.map(a => a.src) }
    })
    expect(card.title).toBe('Touch screen song')
    expect(card.artist).toBe('Chronovault')
    expect(card.album).toBe('Chronovault')
    expect(card.artwork[0]).toMatch(/^http.*\/cover-fallback\.webp$/)

    // Cast: on phones it is in the full-screen view; a tap opens the device picker, and the
    // button shows the connection.
    await page.getByTestId('player-track-area').tap()
    // The Cast button of the full-screen view.
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
    // The track that gets lyrics.
    const id = await firstTrackId(page)

    // A track without lyrics or description: the view has neither, and no Lyrics button.
    await page.getByTestId('track-title').tap()
    await page.getByTestId('player-track-area').tap()
    // The full-screen view.
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
      // Thirty synced lines: enough to scroll.
      const lyricsSynced = Array.from({ length: 30 }, (_, i) => ({ time: i * 2, text: `Sung line ${i + 1}` }))
      // The lyrics saved through the API, like the editor does.
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
    // The phones' lyrics view.
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
    // Where the view is on screen: it must end within the screen.
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
    await clickAndWaitForApi(page, page.getByTestId('save-bar').getByRole('button', { name: 'Save' }), SAVE_TRACK)

    // The share box: "Share link" hands title and link to the share sheet.
    const share = page.getByTestId('share-box').getByTestId('copy-share-link')
    await expect(share).toHaveText('Share link')
    await share.tap()
    await expect.poll(async () => (await deviceLog(page)).shared).toHaveLength(1)
    // What the share sheet was handed.
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
