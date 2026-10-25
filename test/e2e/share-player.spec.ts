/**
 * End-to-end, the player of the share pages (which have no player bar): previous / next on a
 * shared playlist, the volume (a slider with a mouse; on a phone mute alone, at full level whatever
 * was saved), the full-screen view without the owner's tools, the mini player
 * that takes over at the bottom of a phone screen once the page's player is scrolled away, and
 * playback going on with the screen off: the page hidden and no frames drawn, the next track
 * still starts by itself and its play is still counted.
 */
import { expect, test, type Page } from '@playwright/test'
import { signUp, uploadTrack, waitForHydration } from './helpers'

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
    const tracks = await (await fetch('/api/tracks')).json() as { id: string, title: string }[]
    const ids = Object.fromEntries(tracks.map(t => [t.title, t.id]))
    const lyrics = Array.from({ length: 40 }, (_, i) => `Line ${i + 1} of the tide`).join('\n')
    await fetch(`/api/tracks/${ids[titles[0]!]}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lyrics }),
    })
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
    const { playlist, ids } = await sharedPlaylist(page)
    const url = `/p/${playlist}`

    // --- A visitor on a desktop ---
    const desktop = await browser.newContext()
    try {
      const visitor = await desktop.newPage()
      await visitor.goto(url)
      await waitForHydration(visitor)
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
      localStorage.setItem('chronoplayer:volume', '0.3')
      const recorder = window as unknown as { __volumes: number[] }
      recorder.__volumes = []
      const volume = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'volume')!
      Object.defineProperty(HTMLMediaElement.prototype, 'volume', {
        configurable: true,
        get() {
          return volume.get!.call(this)
        },
        set(value: number) {
          recorder.__volumes.push(value)
          volume.set!.call(this, value)
        },
      })
    })
    try {
      const visitor = await phone.newPage()
      await visitor.goto(url)
      await waitForHydration(visitor)
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
})
