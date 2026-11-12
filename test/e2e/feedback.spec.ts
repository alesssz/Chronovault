/**
 * End-to-end, the listeners' feedback on a group of versions: a friend opens the link, listens
 * to one version to the end (a play, completed) and picks another with a name and a note; the
 * owner sees it all on the Versions page, cannot vote on their own group, and closes the vote by
 * marking a version final; the friend then sees the chosen version and no more hearts. While
 * voting is open, how to vote is said under the title, above the list, and a pick reads
 * "Saved" at once, its note having a "Save note" of its own; a vote state that fails to load
 * leaves the page without hearts and without the line asking for one. The
 * Statistics page counts the friend's play, apart from the owner's own. The APIs refuse what
 * they must (plays of tracks the caller cannot hear, the owner's vote), and past the caps on
 * anonymous writes (100 visitors per track a day, 50 votes per group) answer 429. A note typed
 * and not saved yet survives picking another version.
 */
import { expect, test, type Page } from './fixtures'
import { seedLibrary, signUp, uploadTrack, waitForHydration } from './helpers'

/** Two versions of the same song (3-second WAVs: a play at 1.5 s, completed at 2.7 s). */
const VERSIONS = ['Echo v1', 'Echo v2']

/** The owner's tracks, by title (read through the API from the signed-in page). */
async function trackIds(page: Page): Promise<Record<string, string>> {
  // The user's tracks, read through the page (its session goes along).
  const tracks = await page.evaluate(async () => (await (await fetch('/api/tracks')).json() as { id: string, title: string }[]))
  return Object.fromEntries(tracks.map(t => [t.title, t.id]))
}

test.describe('listeners\' feedback', () => {
  test('a friend plays and votes; the owner sees it, closes the vote, and finds the play in Statistics', async ({ page, browser }) => {
    test.setTimeout(120_000)
    await signUp(page)
    for (const title of VERSIONS) await uploadTrack(page, title)
    // The versions' ids, by title.
    const ids = await trackIds(page)

    // An unlisted group of the two versions, as "Share for feedback" makes it.
    const group = await page.evaluate(async (trackIds) => {
      const response = await fetch('/api/playlists', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Echo – versions', purpose: 'versions', visibility: 'unlisted', trackIds }),
      })
      return (await response.json() as { id: string }).id
    }, [ids['Echo v1'], ids['Echo v2']])

    // --- The vote state does not load: no hearts, so no line asking for one ---
    // The line is in the server's page (voting read as open from the versions); the failed
    // load must take it away, or it asks for hearts that never come.
    const brokenContext = await browser.newContext()
    try {
      await brokenContext.route(/\/api\/shared\/playlists\/[^/]+\/vote/, route =>
        route.request().method() === 'GET' ? route.fulfill({ status: 500 }) : route.continue())
      const broken = await brokenContext.newPage()
      await broken.goto(`/p/${group}`)
      await waitForHydration(broken)
      await expect(broken.getByTestId('version-vote-hint')).toHaveCount(0)
      await expect(broken.getByTestId('version-pick')).toHaveCount(0)
      await expect(broken.getByTestId('shared-playlist-track')).toHaveCount(2)
    }
    finally {
      await brokenContext.close()
    }

    // A friend without an account, in another browser context.
    const friendContext = await browser.newContext()
    try {
      // The friend's page.
      const friend = await friendContext.newPage()
      await friend.goto(`/p/${group}`)
      // A server-rendered page: clicks before hydration do nothing.
      await waitForHydration(friend)
      /** A version's row on the public page. */
      const friendRow = (title: string) => friend.getByTestId('shared-playlist-track').filter({ hasText: title })

      // --- Voting is open: a heart per version, and how to vote under the title ---
      await expect(friend.getByTestId('version-pick')).toHaveCount(2)
      const hint = friend.getByTestId('version-vote-hint')
      // Worded for any device ("tap" on a desktop), and above the list: under it, it sat at the
      // bottom edge of a desktop screen.
      await expect(hint).toHaveText('Listen to each version, then choose the heart next to your favourite.')
      const hintBox = (await hint.boundingBox())!
      const firstRow = (await friend.getByTestId('shared-playlist-track').first().boundingBox())!
      expect(hintBox.y + hintBox.height).toBeLessThanOrEqual(firstRow.y)
      // No pick yet: no panel under the list.
      await expect(friend.getByTestId('version-vote-note')).toHaveCount(0)

      // --- The friend listens to v1 to the end: a play, then a completed one ---
      const completed = friend.waitForRequest(request => request.url().endsWith('/api/plays')
        && request.method() === 'POST' && (request.postDataJSON() as { completed: boolean }).completed)
      await friendRow('Echo v1').getByRole('button', { name: /Echo v1/ }).first().click()
      await completed

      // --- …and picks v2, with a name and a note for the owner ---
      await friendRow('Echo v2').getByRole('button', { name: 'Pick Echo v2' }).click()
      await expect(friendRow('Echo v2').getByTestId('version-pick')).toHaveAttribute('aria-pressed', 'true')
      await expect(friend.getByTestId('version-vote-note')).toContainText('Your pick: Echo v2')
      // Stored as soon as the heart is chosen, and the panel says so: the note's own button is
      // "Save note", not a "Save" that read as the pick still to be sent.
      await expect(friend.getByTestId('version-vote-saved')).toHaveText('Saved')
      await expect(friend.getByTestId('version-vote-save')).toHaveText('Save note')
      await expect(friend.getByTestId('version-vote-save')).toBeDisabled()
      await friend.getByTestId('version-vote-name').fill('Marco')
      await friend.getByTestId('version-vote-comment').fill('The chorus hits harder')
      await friend.getByTestId('version-vote-save').click()
      await expect(friend.getByText('Note saved').first()).toBeVisible()

      // The pick belongs to this browser: it is still there after a reload.
      await friend.reload()
      await expect(friendRow('Echo v2').getByTestId('version-pick')).toHaveAttribute('aria-pressed', 'true')
      await expect(friend.getByTestId('version-vote-name')).toHaveValue('Marco')

      // --- The owner on their own group page: a note, no hearts ---
      await page.goto(`/p/${group}`)
      await expect(page.getByTestId('version-vote-owner')).toBeVisible()
      await expect(page.getByTestId('version-pick')).toHaveCount(0)
      // Nothing to choose: no "choose the heart" line (it is in the server's page, gone once
      // the state says this is the owner).
      await expect(page.getByTestId('version-vote-hint')).toHaveCount(0)
      // …and the API refuses an owner's vote.
      const ownerVote = await page.request.put(`/api/shared/playlists/${group}/vote`, {
        data: { voterId: crypto.randomUUID(), trackId: ids['Echo v1'] },
      })
      expect(ownerVote.status()).toBe(403)

      // --- The Versions page: votes, plays and the note ---
      await page.goto(`/versions/${group}`)
      // The group's feedback panel on the owner's page.
      const panel = page.getByTestId('version-feedback')
      await expect(panel.getByTestId('version-feedback-totals')).toHaveText('1 vote · 1 listener')
      await expect(panel.getByTestId('version-feedback-status')).toContainText('Voting is open')
      // The owner's row of a version.
      const ownerRow = (title: string) => page.getByTestId('playlist-track').filter({ hasText: title })
      await expect(ownerRow('Echo v1').getByTestId('version-tally')).toContainText('0 votes')
      await expect(ownerRow('Echo v1').getByTestId('version-tally')).toContainText('1 play, 1 to the end')
      await expect(ownerRow('Echo v2').getByTestId('version-tally')).toContainText('1 vote')
      await expect(panel.getByTestId('version-feedback-comment')).toContainText('Marco')
      await expect(panel.getByTestId('version-feedback-comment')).toContainText('The chorus hits harder')

      // --- v2 is marked final: voting closes ---
      await ownerRow('Echo v2').getByRole('button', { name: 'Actions for Echo v2' }).click()
      await page.getByRole('menuitem', { name: 'Mark as final' }).click()
      await expect(panel.getByTestId('version-feedback-status')).toContainText('Voting is closed')

      // The friend sees the outcome, and the hearts are gone.
      await friend.reload()
      await expect(friend.getByTestId('version-vote-closed')).toContainText('Echo v2')
      await expect(friend.getByTestId('version-pick')).toHaveCount(0)
      await expect(friendRow('Echo v2').getByTestId('shared-track-chosen')).toBeVisible()
      await expect(friend.getByTestId('version-vote-hint')).toHaveCount(0)

      // --- Plays the caller cannot hear are refused ---
      // v1 is private: without the group, a visitor has nothing to count.
      const outside = await friend.request.post('/api/plays', {
        data: { trackId: ids['Echo v1'], listenerId: crypto.randomUUID() },
      })
      expect(outside.status()).toBe(404)
      expect((await friend.request.post('/api/plays', { data: { trackId: 'nope' } })).status()).toBe(400)
    }
    finally {
      await friendContext.close()
    }

    // --- Statistics: the friend's play, and none of the owner's ---
    await page.goto('/stats')
    await expect(page.getByTestId('stats-plays')).toHaveText('1')
    await expect(page.getByTestId('stats-listeners')).toHaveText('1')
    await expect(page.getByTestId('stats-own-plays')).toHaveText('0')
    await expect(page.getByTestId('stats-plays-chart').getByTestId('stats-day-bar')).toHaveCount(30)
    // The group's row on the Statistics page.
    const groupRow = page.getByTestId('stats-item').filter({ hasText: 'Echo – versions' })
    await expect(groupRow.getByTestId('stats-item-plays')).toContainText('1 play')
    await expect(groupRow.getByTestId('stats-item-plays')).toContainText('1 to the end')
  })

  test('the caps on anonymous writes: 100 visitors per track a day, 50 votes per group', async ({ page, browser }) => {
    test.setTimeout(120_000)
    await signUp(page)
    // Two drafts, straight through the API ("Track 001", "Track 002").
    await seedLibrary(page, 2)
    // Their ids, by title.
    const ids = await trackIds(page)
    const [first, second] = [ids['Track 001']!, ids['Track 002']!]

    // An unlisted group of the two, as "Share for feedback" makes it.
    const group = await page.evaluate(async (trackIds) => {
      const response = await fetch('/api/playlists', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Crowded – versions', purpose: 'versions', visibility: 'unlisted', trackIds }),
      })
      return (await response.json() as { id: string }).id
    }, [first, second])

    // Visitors without an account, in another browser context.
    const visitorsContext = await browser.newContext()
    try {
      // The visitors' API client (no session).
      const api = visitorsContext.request

      // --- Plays: 100 different visitors of the first version today, then no more ---
      for (let i = 0; i < 100; i++) {
        // Each request a new browser id, as a script would make up.
        const response = await api.post('/api/plays', { data: { trackId: first, playlistId: group, listenerId: crypto.randomUUID() } })
        expect(response.status(), `visitor ${i + 1}`).toBe(204)
      }
      expect((await api.post('/api/plays', { data: { trackId: first, playlistId: group, listenerId: crypto.randomUUID() } })).status()).toBe(429)
      // The cap is per track: the other version still counts new visitors.
      expect((await api.post('/api/plays', { data: { trackId: second, playlistId: group, listenerId: crypto.randomUUID() } })).status()).toBe(204)

      // --- Votes: 50 visitors vote, the group is full ---
      for (let i = 0; i < 50; i++) {
        // Each vote a new voter id.
        const response = await api.put(`/api/shared/playlists/${group}/vote`, { data: { voterId: crypto.randomUUID(), trackId: first } })
        expect(response.status(), `vote ${i + 1}`).toBe(200)
      }

      // A 51st friend on the page: told the group is full, and their heart stays off.
      const friend = await visitorsContext.newPage()
      await friend.goto(`/p/${group}`)
      // A server-rendered page: clicks before hydration do nothing.
      await waitForHydration(friend)
      // The second version's row on the public page.
      const row = friend.getByTestId('shared-playlist-track').filter({ hasText: 'Track 002' })
      await row.getByRole('button', { name: 'Pick Track 002' }).click()
      await expect(friend.getByText('This group is full').first()).toBeVisible()
      await expect(row.getByTestId('version-pick')).toHaveAttribute('aria-pressed', 'false')
    }
    finally {
      await visitorsContext.close()
    }

    // The owner's page counts exactly the votes the cap let in.
    await page.goto(`/versions/${group}`)
    await expect(page.getByTestId('version-feedback').getByTestId('version-feedback-totals')).toContainText('50 votes')
  })

  test('a note typed and not saved yet survives picking another version', async ({ page, browser }) => {
    await signUp(page)
    // Two drafts, straight through the API ("Track 001", "Track 002"), in an unlisted group.
    await seedLibrary(page, 2)
    // Their ids, by title.
    const ids = await trackIds(page)
    const group = await page.evaluate(async (trackIds) => {
      const response = await fetch('/api/playlists', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Notes – versions', purpose: 'versions', visibility: 'unlisted', trackIds }),
      })
      return (await response.json() as { id: string }).id
    }, [ids['Track 001']!, ids['Track 002']!])

    const friendContext = await browser.newContext()
    try {
      // A friend on the group's page picks the first version and starts writing a note.
      const friend = await friendContext.newPage()
      await friend.goto(`/p/${group}`)
      await waitForHydration(friend)
      // The two versions' rows.
      const row = (title: string) => friend.getByTestId('shared-playlist-track').filter({ hasText: title })
      await row('Track 001').getByRole('button', { name: 'Pick Track 001' }).click()
      await expect(row('Track 001').getByTestId('version-pick')).toHaveAttribute('aria-pressed', 'true')
      await friend.getByTestId('version-vote-name').fill('Marco')
      await friend.getByTestId('version-vote-comment').fill('Still deciding')

      // Then changes their mind before saving the note.
      await row('Track 002').getByRole('button', { name: 'Pick Track 002' }).click()
      await expect(row('Track 002').getByTestId('version-pick')).toHaveAttribute('aria-pressed', 'true')
      // Before: the answer to the new pick reset both fields to the saved (empty) note.
      await expect(friend.getByTestId('version-vote-name')).toHaveValue('Marco')
      await expect(friend.getByTestId('version-vote-comment')).toHaveValue('Still deciding')
      // Still to save: the note goes with the new pick.
      await friend.getByTestId('version-vote-save').click()
      await expect(friend.getByText('Note saved').first()).toBeVisible()
    }
    finally {
      await friendContext.close()
    }
  })
})
