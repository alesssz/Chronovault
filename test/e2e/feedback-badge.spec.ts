/**
 * End-to-end, the "new feedback" signal: nothing before anyone votes; after a friend's vote, a dot
 * on "Versions" and "1 new" on the group's card; inside the group, the new vote and comment are
 * marked, and the dot goes at once; once the owner leaves the group, the card is quiet again,
 * also after a reload (the visit is stored on the server); a changed vote brings it back.
 */
import { expect, test, type Browser, type Page } from './fixtures'
import { signUp, uploadTrack, waitForHydration } from './helpers'

/** The friend's side: opens the group's link in a fresh browser and picks a version, with a note. */
async function friendVotes(browser: Browser, group: string, version: string, note: string) {
  // A friend without an account, in another browser context.
  const context = await browser.newContext()
  try {
    // The friend's page.
    const friend = await context.newPage()
    await friend.goto(`/p/${group}`)
    // A server-rendered page: clicks before hydration do nothing.
    await waitForHydration(friend)
    await friend.getByTestId('shared-playlist-track').filter({ hasText: version }).getByRole('button', { name: `Pick ${version}` }).click()
    await friend.getByTestId('version-vote-comment').fill(note)
    await friend.getByTestId('version-vote-save').click()
    await expect(friend.getByText('Note saved').first()).toBeVisible()
  }
  finally {
    await context.close()
  }
}

/**
 * Runs `navigate` (a reload, a visit) and waits for the page's answer about unseen feedback
 * (GET /api/feedback/unseen), returning the server's total. The badges show nothing until that
 * answer comes (their default), so checking that they are absent before it proves nothing.
 */
async function unseenAfter(page: Page, navigate: () => Promise<unknown>): Promise<number> {
  // The answer, listened for before navigating so a fast one is not missed.
  const answer = page.waitForResponse(response => new URL(response.url()).pathname === '/api/feedback/unseen')
  await navigate()
  return (await (await answer).json() as { total: number }).total
}

/** The owner's group card on the Versions page. */
function card(page: Page) {
  return page.getByTestId('playlist-card').filter({ hasText: 'Wave – versions' })
}

test.describe('new feedback signal', () => {
  test('a dot and a badge for votes since the owner\'s last visit, gone once seen', async ({ page, browser }) => {
    test.setTimeout(120_000)
    await signUp(page)
    for (const title of ['Wave v1', 'Wave v2']) await uploadTrack(page, title)
    // An unlisted group of the two versions, as "Share for feedback" makes it.
    const group = await page.evaluate(async () => {
      const tracks = await (await fetch('/api/tracks')).json() as { id: string }[]
      const response = await fetch('/api/playlists', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Wave – versions', purpose: 'versions', visibility: 'unlisted', trackIds: tracks.map(t => t.id) }),
      })
      return (await response.json() as { id: string }).id
    })
    // The dot on "Versions" in the header (absent while nothing is new).
    const dot = page.getByTestId('section-dot-versions')

    // --- Nobody voted yet: nothing new (the server says so, and the page with it) ---
    expect(await unseenAfter(page, () => page.goto('/versions'))).toBe(0)
    await expect(card(page)).toBeVisible()
    await expect(card(page).getByTestId('playlist-card-new')).toHaveCount(0)
    await expect(dot).toHaveCount(0)

    // --- A friend votes: the dot and the card's badge (the Versions page asks again when opened) ---
    await friendVotes(browser, group, 'Wave v2', 'Smoother mix')
    await page.reload()
    await expect(dot).toBeVisible()
    await expect(card(page).getByTestId('playlist-card-new')).toHaveText('1 new')

    // --- Inside the group: what is new is marked, and the dot goes at once ---
    await card(page).click()
    // The group's feedback panel.
    const panel = page.getByTestId('version-feedback')
    await expect(panel.getByTestId('version-feedback-unseen')).toHaveText('1 new vote since your last visit')
    await expect(panel.getByTestId('version-feedback-comment-new')).toBeVisible()
    await expect(dot).toHaveCount(0)

    // --- Back to Versions: the visit was recorded, the card is quiet, even after a reload ---
    // The page asks again once the visit is recorded: its answer is waited for here, or it could
    // still be on its way at the reload below, be taken for the reloaded page's own and be gone
    // (its body is dropped with the page it belonged to).
    expect(await unseenAfter(page, () => page.getByRole('link', { name: 'Back to versions' }).click())).toBe(0)
    await expect(card(page)).toBeVisible()
    await expect(card(page).getByTestId('playlist-card-new')).toHaveCount(0)
    // After a reload, once the page has the server's answer: the visit is stored there. Before, the
    // badges were checked before that answer, when they show nothing anyway.
    expect(await unseenAfter(page, () => page.reload())).toBe(0)
    await expect(card(page)).toBeVisible()
    await expect(card(page).getByTestId('playlist-card-new')).toHaveCount(0)
    await expect(dot).toHaveCount(0)

    // Inside again: nothing is new any more.
    await card(page).click()
    await expect(page.getByTestId('version-feedback')).toBeVisible()
    await expect(page.getByTestId('version-feedback-unseen')).toHaveCount(0)
    await expect(page.getByTestId('version-feedback-comment-new')).toHaveCount(0)

    // --- The friend changes their mind: new again ---
    await friendVotes(browser, group, 'Wave v1', 'Actually, the first one')
    await page.goto('/versions')
    await expect(card(page).getByTestId('playlist-card-new')).toHaveText('1 new')
    await expect(dot).toBeVisible()

    // --- Only the owner's groups: the API answers 404 for anything else ---
    const missing = await page.request.post('/api/playlists/00000000-0000-4000-8000-000000000000/feedback/seen')
    expect(missing.status()).toBe(404)
  })
})
