/**
 * End-to-end, a playlist's track list under writes that overlap: two "Add to playlist" at once
 * both land (an append used to read the list and write it back, so one overwrote the other); two
 * replacements at once never clash (one used to fail with 409); and two reorders in quick
 * succession on the playlist page are saved in the order they were made, so the order on screen
 * is the order a reload shows (the second used to reach the server first and be overwritten).
 */
import { expect, test, type Page } from './fixtures'
import { seedLibrary, signUp } from './helpers'

/** The user's tracks by title, and a new playlist holding the first of `titles` (through the API). */
async function playlistOf(page: Page, titles: string[]) {
  return page.evaluate(async (titles) => {
    // The tracks seeded for the test, by title.
    const tracks = await (await fetch('/api/tracks')).json() as { id: string, title: string }[]
    const ids = Object.fromEntries(tracks.map(t => [t.title, t.id]))
    // A playlist holding the first track only.
    const response = await fetch('/api/playlists', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Overlapping writes', trackIds: [ids[titles[0]!]] }),
    })
    return { playlist: (await response.json() as { id: string }).id, ids }
  }, titles)
}

/** The playlist's track titles, in order, as the server has them. */
async function savedTitles(page: Page, playlist: string): Promise<string[]> {
  return page.evaluate(async (id) => {
    // The playlist as stored.
    const detail = await (await fetch(`/api/playlists/${id}`)).json() as { tracks: { title: string }[] }
    return detail.tracks.map(t => t.title)
  }, playlist)
}

test.describe('overlapping playlist writes', () => {
  test('two appends at once both land; two replacements at once never clash', async ({ page }) => {
    await signUp(page)
    await seedLibrary(page, 3)
    // Track 001 in the playlist; 002 and 003 added at the same moment.
    const { playlist, ids } = await playlistOf(page, ['Track 001'])

    // Both appends, sent together.
    const appends = await page.evaluate(async ({ playlist, add }) => {
      // POST /api/playlists/:id/tracks with one track.
      const post = (trackId: string) => fetch(`/api/playlists/${playlist}/tracks`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ trackIds: [trackId] }),
      }).then(r => r.status)
      return Promise.all(add.map(post))
    }, { playlist, add: [ids['Track 002']!, ids['Track 003']!] })
    expect(appends).toEqual([200, 200])
    expect((await savedTitles(page, playlist)).sort()).toEqual(['Track 001', 'Track 002', 'Track 003'])

    // Two whole new orders, sent together: both answer, and one of them is what is stored.
    const orders = [['Track 003', 'Track 002', 'Track 001'], ['Track 002', 'Track 001', 'Track 003']]
    const replaces = await page.evaluate(async ({ playlist, orders }) => Promise.all(orders.map(order =>
      fetch(`/api/playlists/${playlist}/tracks`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ trackIds: order }),
      }).then(r => r.status))), { playlist, orders: orders.map(order => order.map(title => ids[title]!)) })
    expect(replaces).toEqual([200, 200])
    expect(orders).toContainEqual(await savedTitles(page, playlist))
  })

  test('two quick reorders on the page are saved in the order they were made', async ({ page }) => {
    await signUp(page)
    await seedLibrary(page, 3)
    const { playlist, ids } = await playlistOf(page, ['Track 001'])
    // The other two tracks appended, one after the other: 001, 002, 003.
    for (const title of ['Track 002', 'Track 003']) {
      await page.evaluate(async ({ playlist, trackId }) => {
        await fetch(`/api/playlists/${playlist}/tracks`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ trackIds: [trackId] }),
        })
      }, { playlist, trackId: ids[title]! })
    }

    // The first save of the list held back for a moment, as a slow network or a cold server would.
    let held = false
    await page.route(`**/api/playlists/${playlist}/tracks`, async (route) => {
      if (route.request().method() === 'PUT' && !held) {
        held = true
        await new Promise(resolve => setTimeout(resolve, 1_500))
      }
      await route.continue()
    })

    // Saves of the list answered so far (both must be in before the result is read).
    let answered = 0
    page.on('response', (response) => {
      if (response.request().method() === 'PUT' && response.url().endsWith(`/api/playlists/${playlist}/tracks`)) answered++
    })

    await page.goto(`/playlists/${playlist}`)
    // A track row's "⋮" menu, then one of its items.
    const rowAction = async (title: string, action: string) => {
      await page.getByTestId('playlist-track').filter({ hasText: title }).getByRole('button', { name: `Actions for ${title}` }).click()
      await page.getByRole('menuitem', { name: action }).click()
    }
    // 001 down (002, 001, 003), then at once 003 up (002, 003, 001), while the first save waits.
    await rowAction('Track 001', 'Move down')
    await rowAction('Track 003', 'Move up')
    // The page's titles, as shown.
    const shown = page.getByTestId('playlist-track-title')
    await expect(shown).toContainText(['Track 002', 'Track 003', 'Track 001'])

    // Both saves answered (the held one last, when it was sent first), then the server and a reload agree.
    await expect.poll(() => answered, { timeout: 15_000 }).toBe(2)
    expect(await savedTitles(page, playlist)).toEqual(['Track 002', 'Track 003', 'Track 001'])
    await expect(shown).toContainText(['Track 002', 'Track 003', 'Track 001'])
    await page.reload()
    await expect(shown).toContainText(['Track 002', 'Track 003', 'Track 001'])
  })
})
