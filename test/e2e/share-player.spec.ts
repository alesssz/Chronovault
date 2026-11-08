/**
 * End-to-end, the player of the share pages (which have no player bar): previous / next on a
 * shared playlist, the volume (a slider with a mouse; on a phone mute alone, at full level whatever
 * was saved), the full-screen view without the owner's tools, the mini player
 * that takes over at the bottom of a phone screen once the page's player is scrolled away, and
 * playback going on with the screen off: the page hidden and no frames drawn, the next track
 * still starts by itself and its play is still counted. And the volume saved on the device shows
 * on a server-rendered share page from its first render. On a playlist's page the row shown as
 * playing is the one being moved to (even while it loads), a click on the one before goes back to
 * it, and after a failed track the big Play tries that track again.
 */
import { expect, test, type Page } from './fixtures'
import { seedLibrary, signUp, uploadTrack, waitForHydration } from './helpers'

/**
 * Three 12-second tracks: long enough for the checks between two track changes (previous and
 * next start playing at once), short enough to wait for one to end (a play at 6 s, completed at
 * 10.8 s).
 */
const TRACKS = ['Tide 1', 'Tide 2', 'Tide 3']
/** Length of each track, in seconds. */
const SECONDS = 12

/**
 * The owner's account with the three tracks in an unlisted playlist; Tide 1 has long lyrics,
 * so a phone's page is long enough to scroll the player away. Returns the playlist and track ids.
 */
async function sharedPlaylist(page: Page): Promise<{ playlist: string, ids: Record<string, string> }> {
  await signUp(page)
  for (const title of TRACKS) await uploadTrack(page, title, { seconds: SECONDS })
  return page.evaluate(async (titles) => {
    // The tracks just uploaded, by title.
    const tracks = await (await fetch('/api/tracks')).json() as { id: string, title: string }[]
    const ids = Object.fromEntries(tracks.map(t => [t.title, t.id]))
    // Forty lines of lyrics: enough to make the page long on a phone.
    const lyrics = Array.from({ length: 40 }, (_, i) => `Line ${i + 1} of the tide`).join('\n')
    await fetch(`/api/tracks/${ids[titles[0]!]}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lyrics }),
    })
    // The shared playlist of the three tracks.
    const response = await fetch('/api/playlists', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Tides', visibility: 'unlisted', trackIds: titles.map(t => ids[t]) }),
    })
    return { playlist: (await response.json() as { id: string }).id, ids }
  }, TRACKS)
}

test.describe('share page player', () => {
  test('previous / next, volume, full screen, the phone\'s mini player, and the screen off', async ({ page, browser }) => {
    test.setTimeout(150_000)
    // The playlist and its tracks' ids.
    const { playlist, ids } = await sharedPlaylist(page)
    // Its share page.
    const url = `/p/${playlist}`

    // --- A visitor on a desktop ---
    const desktop = await browser.newContext()
    try {
      // A visitor without an account, in another browser context.
      const visitor = await desktop.newPage()
      await visitor.goto(url)
      await waitForHydration(visitor)
      // The title of what is playing, on the page.
      const nowPlaying = visitor.getByTestId('shared-now-playing-title')
      await expect(nowPlaying).toHaveText('Tide 1')
      // A playlist with tracks is never called empty (the vote panel once stole its v-else).
      await expect(visitor.getByTestId('shared-playlist-track')).toHaveCount(3)
      await expect(visitor.getByTestId('shared-playlist-empty')).toHaveCount(0)

      // Previous and next move through the playlist.
      await visitor.getByTestId('shared-next').click()
      await expect(nowPlaying).toHaveText('Tide 2')
      await visitor.getByTestId('shared-previous').click()
      await expect(nowPlaying).toHaveText('Tide 1')

      // The volume: mute (and back), and a slider where the page can set it.
      await visitor.getByRole('button', { name: 'Mute' }).click()
      await expect(visitor.getByRole('button', { name: 'Unmute' })).toBeVisible()
      await visitor.getByRole('button', { name: 'Unmute' }).click()
      await expect(visitor.getByRole('slider', { name: 'Volume' })).toBeVisible()

      // The full-screen view, without the owner's tools.
      await visitor.getByTestId('shared-expand').click()
      // The full-screen view.
      const expanded = visitor.getByTestId('player-expanded')
      await expect(expanded).toContainText('Tide 1')
      await expect(expanded.getByRole('button', { name: 'Edit track' })).toHaveCount(0)
      await expect(expanded.getByRole('button', { name: 'Up next' })).toHaveCount(0)
      await expanded.getByRole('button', { name: 'Collapse player' }).click()
      await expect(expanded).toBeHidden()

      // --- The screen goes off while Tide 1 plays: no frames, page hidden ---
      // A fresh visit: Tide 1 ready and paused (previous and next above started the music).
      await visitor.reload()
      await waitForHydration(visitor)
      await expect(nowPlaying).toHaveText('Tide 1')
      // Tide 2 must still start by itself when Tide 1 ends, and its play be counted:
      // that needs the position, reported by timeupdate once frames stop.
      const tide2Completed = visitor.waitForRequest(request => request.url().endsWith('/api/plays')
        && request.method() === 'POST'
        && (request.postDataJSON() as { trackId: string, completed: boolean }).trackId === ids['Tide 2']
        && (request.postDataJSON() as { completed: boolean }).completed, { timeout: 2 * SECONDS * 1000 + 15_000 })
      await visitor.getByTestId('shared-play').click()
      await expect(visitor.getByTestId('shared-play')).toHaveAccessibleName('Pause')
      await visitor.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
        // A hidden page draws no frames: the ones asked for from now on never come.
        window.requestAnimationFrame = () => 0
        document.dispatchEvent(new Event('visibilitychange'))
      })
      // Tide 1 to its end, then 90% of Tide 2: a few seconds of margin on top.
      await tide2Completed
    }
    finally {
      await desktop.close()
    }

    // --- A visitor on a phone: the mini player once the page's player is scrolled away ---
    const phone = await browser.newContext({ viewport: { width: 412, height: 700 }, isMobile: true, hasTouch: true })
    // A low volume saved on this phone by an older version of the app, and a recorder of every
    // level the page gives an audio element: on a touch screen it must play at full volume.
    await phone.addInitScript(() => {
      localStorage.setItem('chronovault:volume', '0.3')
      // Every volume the page sets on an audio element, recorded below.
      const recorder = window as unknown as { __volumes: number[] }
      recorder.__volumes = []
      // The browser's own volume property, wrapped to record the writes.
      const volume = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'volume')!
      Object.defineProperty(HTMLMediaElement.prototype, 'volume', {
        configurable: true,
        // Reading is unchanged.
        get() {
          return volume.get!.call(this)
        },
        // Writing is recorded, then done as usual.
        set(value: number) {
          recorder.__volumes.push(value)
          volume.set!.call(this, value)
        },
      })
    })
    try {
      // A visitor on a phone.
      const visitor = await phone.newPage()
      await visitor.goto(url)
      await waitForHydration(visitor)
      // The mini player at the bottom of the screen.
      const mini = visitor.getByTestId('shared-mini-player')
      // The page's own player is on screen: no mini player yet.
      await expect(visitor.getByTestId('shared-play')).toBeVisible()
      await expect(mini).toHaveCount(0)

      // Down to Tide 1's lyrics: the player leaves the screen, the mini player arrives.
      await visitor.getByTestId('shared-lyrics').scrollIntoViewIfNeeded()
      await visitor.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
      await expect(mini).toBeVisible()
      await expect(mini).toContainText('Tide 1')

      // It plays, and opens the full-screen view.
      await mini.getByTestId('shared-mini-toggle').click()
      await expect(mini.getByTestId('shared-mini-toggle')).toHaveAccessibleName('Pause')
      await mini.getByTestId('shared-mini-open').click()
      // The full-screen view, opened from the mini player.
      const expanded = visitor.getByTestId('player-expanded')
      await expect(expanded).toBeVisible()

      // The volume on a touch screen: mute alone, here and in the full-screen view; no slider.
      await expect(expanded.getByRole('button', { name: 'Mute' })).toBeVisible()
      await expect(visitor.getByRole('slider', { name: 'Volume' })).toHaveCount(0)
      // The page plays at full level: the 0.3 saved on the device is never applied.
      const levels = await visitor.evaluate(() => (window as unknown as { __volumes: number[] }).__volumes)
      expect(levels.length).toBeGreaterThan(0)
      expect(levels.every(level => level === 1)).toBe(true)
    }
    finally {
      await phone.close()
    }
  })

  test('the volume saved on this device shows on a share page, not the server\'s full level', async ({ page, browser }) => {
    await signUp(page)
    await seedLibrary(page, 1)
    // The seeded track, shared by link; its id.
    const id = await page.evaluate(async () => {
      // The only track of the library.
      const [track] = await (await fetch('/api/tracks')).json() as { id: string }[]
      await fetch(`/api/tracks/${track!.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ visibility: 'unlisted' }),
      })
      return track!.id
    })

    const desktop = await browser.newContext()
    try {
      // A visitor who left the volume at 30% on an earlier visit (saved before any page runs).
      await desktop.addInitScript(() => localStorage.setItem('chronovault:volume', '0.3'))
      const visitor = await desktop.newPage()
      await visitor.goto(`/t/${id}`)
      await waitForHydration(visitor)
      // Before: the page rendered by the server said 100%, and hydration kept it there.
      await expect(visitor.getByRole('slider', { name: 'Volume' })).toHaveAttribute('aria-valuenow', '30')
      await expect(visitor.getByRole('button', { name: 'Mute' }).locator('.iconify')).toHaveClass(/volume-1/)
    }
    finally {
      await desktop.close()
    }
  })

  test('a playlist page follows the track being moved to, and retries a failed one', async ({ page, browser }) => {
    test.setTimeout(150_000)
    // The playlist and its tracks' ids.
    const { playlist, ids } = await sharedPlaylist(page)
    const desktop = await browser.newContext()
    try {
      // A visitor on the playlist's page, with Tide 1 playing.
      const visitor = await desktop.newPage()
      await visitor.goto(`/p/${playlist}`)
      await waitForHydration(visitor)
      // The page's rows, the title of what it shows as playing, and its big play button.
      const rows = visitor.getByTestId('shared-playlist-track')
      const nowPlaying = visitor.getByTestId('shared-now-playing-title')
      const play = visitor.getByTestId('shared-play')
      await rows.nth(0).getByRole('button').first().click()
      await expect(play).toHaveAttribute('aria-label', 'Pause')
      // A second click on the row playing opens it full screen (its description is there, not in
      // the page), and the music goes on.
      await rows.nth(0).getByRole('button').first().click()
      const expanded = visitor.getByTestId('player-expanded')
      await expect(expanded).toContainText('Tide 1')
      await expect(play).toHaveAttribute('aria-label', 'Pause')
      await expanded.getByRole('button', { name: 'Collapse player' }).click()
      await expect(expanded).toBeHidden()

      // --- Tide 3 chosen, its address held back: while it loads, it is Tide 3 that shows ---
      // The address of the track being moved to, held until the test lets it go.
      let release!: () => void
      const held = new Promise<void>((resolve) => {
        release = resolve
      })
      // Tide 3's address requests, from then on (the first one is held).
      const tide3 = new RegExp(`/tracks/${ids['Tide 3']}/playback$`)
      await visitor.route(tide3, async (route) => {
        await held
        await route.continue()
      })
      await rows.nth(2).getByRole('button').first().click()
      // Before: Tide 1, still the loaded track, stayed highlighted and in the panel.
      await expect(rows.nth(2).getByRole('button').first()).toHaveAttribute('aria-current', 'true')
      await expect(nowPlaying).toHaveText('Tide 3')
      // A click back on Tide 1 meanwhile goes back to it (before: it paused the track loading).
      await rows.nth(0).getByRole('button').first().click()
      release()
      await expect(nowPlaying).toHaveText('Tide 1')
      await expect(play).toHaveAttribute('aria-label', 'Pause')
      await visitor.unroute(tide3)

      // --- Tide 2 fails to load: the big Play tries Tide 2 again, not Tide 1 ---
      // Tide 2's address requests: refused once, then let through. A 404, which $fetch does not
      // retry by itself (it retries a 503 once, and the track would simply load).
      const tide2 = new RegExp(`/tracks/${ids['Tide 2']}/playback$`)
      let refusals = 0
      await visitor.route(tide2, async (route) => {
        if (refusals++ === 0) await route.fulfill({ status: 404, contentType: 'application/json', body: '{"statusCode":404}' })
        else await route.continue()
      })
      await rows.nth(1).getByRole('button').first().click()
      await expect(nowPlaying).toHaveText('Tide 2')
      // The player's error, under the controls.
      await expect(visitor.getByTestId('shared-error')).toBeVisible()
      // Before: the big Play started the playlist over from Tide 1 (which, 12 s later, moved on to
      // Tide 2 by itself: hence the request for Tide 2 expected at once, well within those 12 s).
      const retried = visitor.waitForRequest(tide2, { timeout: 5_000 })
      await play.click()
      await retried
      await expect(play).toHaveAttribute('aria-label', 'Pause')
      await expect(nowPlaying).toHaveText('Tide 2')
    }
    finally {
      await desktop.close()
    }
  })
})
