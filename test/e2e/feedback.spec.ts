/**
 * End-to-end, the listeners' feedback on a group of versions: a friend opens the link, listens
 * to one version to the end (a play, completed) and picks another with a name and a note; the
 * owner sees it all on the Versions page, cannot vote on their own group, and closes the vote by
 * marking a version final; the friend then sees the chosen version and no more hearts. The
 * Statistics page counts the friend's play, apart from the owner's own. The APIs refuse what
 * they must (plays of tracks the caller cannot hear, the owner's vote).
 */
import { expect, test, type Page } from './fixtures'
import { signUp, uploadTrack } from './helpers'

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

    // A friend without an account, in another browser context.
    const friendContext = await browser.newContext()
    try {
      // The friend's page.
      const friend = await friendContext.newPage()
      await friend.goto(`/p/${group}`)
      /** A version's row on the public page. */
      const friendRow = (title: string) => friend.getByTestId('shared-playlist-track').filter({ hasText: title })

      // --- Voting is open: a heart per version, and a hint ---
      await expect(friend.getByTestId('version-pick')).toHaveCount(2)
      await expect(friend.getByTestId('version-vote-hint')).toBeVisible()

      // --- The friend listens to v1 to the end: a play, then a completed one ---
      const completed = friend.waitForRequest(request => request.url().endsWith('/api/plays')
        && request.method() === 'POST' && (request.postDataJSON() as { completed: boolean }).completed)
      await friendRow('Echo v1').getByRole('button', { name: /Echo v1/ }).first().click()
      await completed

      // --- …and picks v2, with a name and a note for the owner ---
      await friendRow('Echo v2').getByRole('button', { name: 'Pick Echo v2' }).click()
      await expect(friendRow('Echo v2').getByTestId('version-pick')).toHaveAttribute('aria-pressed', 'true')
      await expect(friend.getByTestId('version-vote-note')).toContainText('Your pick: Echo v2')
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
})
