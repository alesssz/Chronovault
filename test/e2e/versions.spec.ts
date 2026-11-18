/**
 * End-to-end, draft versions: new uploads are drafts; several versions are
 * sent to friends in one "Share for feedback" link (marked "WIP" there);
 * the group shows up on the Versions page, not among the playlists; the
 * chosen one is marked final from the group; the others are deleted in one go.
 * A version made later joins the group from the library's "Add to group", or
 * from the group's own "Add versions"; "Remove from group" takes one out.
 * Only drafts can join: a final track is offered by neither. The group's song
 * comes first: on top of the menu, and in the search the dialog starts from.
 */
import { expect, test, type Page } from './fixtures'
import { signUp, uploadTrack } from './helpers'

/** Three Suno versions of the same song (the WAV file name becomes the title). */
const VERSIONS = ['Night drive v1', 'Night drive v2', 'Night drive v3']

test.describe('draft versions', () => {
  test('share versions for feedback, keep the chosen one, delete the rest', async ({ page, browser, context }) => {
    test.setTimeout(90_000)
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await signUp(page)
    for (const title of VERSIONS) await uploadTrack(page, title)
    await page.goto('/')

    // --- New uploads are drafts ---
    const rows = page.getByTestId('track-row')
    await expect(rows).toHaveCount(3)
    await expect(page.getByTestId('draft-badge')).toHaveCount(3)
    const row = (title: string) => rows.filter({ hasText: title })

    // --- Select two versions and share them for feedback ---
    await page.getByTestId('select-mode').click()
    await row('Night drive v1').getByTestId('track-title').click()
    await row('Night drive v2').getByTestId('track-select').click()
    await expect(page.getByTestId('selection-count')).toHaveText('2 selected')
    await page.getByTestId('bulk-feedback').click()
    await expect(page.getByText('Share link copied').first()).toBeVisible()
    const shareUrl = await page.evaluate(() => navigator.clipboard.readText())
    expect(shareUrl).toMatch(/\/p\/[0-9a-f-]{36}$/)
    // Sharing ends selection mode.
    await expect(page.getByTestId('selection-bar')).toBeHidden()

    // A friend opens one link: both versions, marked as work in progress.
    const friendContext = await browser.newContext()
    try {
      const friend = await friendContext.newPage()
      await friend.goto(shareUrl)
      await expect(friend.getByTestId('shared-playlist-title')).toHaveText('Night drive – versions')
      await expect(friend.getByTestId('shared-playlist-track')).toHaveCount(2)
      await expect(friend.getByTestId('shared-track-wip')).toHaveCount(2)
      // Introduced as versions to choose from, not as a playlist.
      await expect(friend.getByText(/^Versions · 2 versions/)).toBeVisible()
      await expect(friend.getByTestId('shared-versions-hint')).toBeVisible()
    }
    finally {
      await friendContext.close()
    }

    // --- The group is kept apart from the playlists ---
    await page.getByRole('link', { name: 'Playlists' }).click()
    await expect(page.getByText('No playlists yet')).toBeVisible()
    await expect(page.getByTestId('playlist-card')).toHaveCount(0)
    await page.getByRole('link', { name: 'Versions', exact: true }).click()
    await expect(page).toHaveURL(/\/versions$/)
    const card = page.getByTestId('playlist-card')
    await expect(card).toHaveCount(1)
    await expect(card).toContainText('Night drive – versions')
    await expect(card).toContainText('2 versions')

    // --- v2 wins: mark it final from the group's page ---
    await card.click()
    await expect(page).toHaveURL(/\/versions\/[0-9a-f-]{36}$/)
    await expect(page.getByTestId('playlist-title')).toHaveText('Night drive – versions')
    // The sharing box in a group's words, not a playlist's.
    await expect(page.getByTestId('share-box')).toContainText('every version in this group')
    const versionRow = (title: string) => page.getByTestId('playlist-track').filter({ hasText: title })
    await versionRow('Night drive v2').getByRole('button', { name: 'Actions for Night drive v2' }).click()
    await page.getByRole('menuitem', { name: 'Mark as final' }).click()
    await expect(page.getByText('Marked as final').first()).toBeVisible()
    await expect(versionRow('Night drive v2').getByTestId('version-final')).toBeVisible()
    await expect(versionRow('Night drive v1').getByTestId('version-final')).toHaveCount(0)

    // The library agrees: v2 is no longer a draft.
    await page.getByRole('link', { name: 'Library' }).click()
    await expect(rows).toHaveCount(3)
    await expect(row('Night drive v2').getByTestId('draft-badge')).toHaveCount(0)

    // --- The version filter ---
    const filter = page.getByTestId('status-filter')
    await filter.click()
    await page.getByRole('option', { name: 'Final' }).click()
    await expect(rows).toHaveText([/Night drive v2/])
    await filter.click()
    await page.getByRole('option', { name: 'Drafts' }).click()
    await expect(rows).toHaveCount(2)

    // --- Delete the losing drafts in one go ---
    await page.getByTestId('select-mode').click()
    await page.getByRole('checkbox', { name: 'Select all' }).click()
    await expect(page.getByTestId('selection-count')).toHaveText('2 selected')
    await page.getByTestId('bulk-delete').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('Delete 2 tracks?')
    await dialog.getByRole('button', { name: 'Delete' }).click()
    await expect(page.getByText('2 tracks deleted').first()).toBeVisible()

    // Only the final version is left.
    await filter.click()
    await page.getByRole('option', { name: 'All versions' }).click()
    await expect(rows).toHaveText([/Night drive v2/])
    const left = await page.evaluate(async () => (await (await fetch('/api/tracks')).json() as { title: string, status: string }[]))
    expect(left).toEqual([expect.objectContaining({ title: 'Night drive v2', status: 'final' })])
  })

  test('a group gains and loses versions after it was shared', async ({ page }) => {
    test.setTimeout(90_000)
    await signUp(page)
    for (const title of [...VERSIONS, 'Morning light', 'Rainbow']) await uploadTrack(page, title)
    // The group as "Share for feedback" makes it, with v1 and v2 (its link was sent);
    // another song, already final, is no version to vote on; a newer group of another song.
    const group = await page.evaluate(async (titles) => {
      const tracks = await (await fetch('/api/tracks')).json() as { id: string, title: string }[]
      const ids = titles.map(title => tracks.find(t => t.title === title)!.id)
      const final = tracks.find(t => t.title === 'Morning light')!.id
      await fetch(`/api/tracks/${final}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'final' }),
      })
      const response = await fetch('/api/playlists', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Night drive – versions', purpose: 'versions', visibility: 'unlisted', trackIds: ids }),
      })
      await fetch('/api/playlists', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Rain – versions', purpose: 'versions', visibility: 'unlisted' }),
      })
      return await response.json() as { id: string }
    }, VERSIONS.slice(0, 2))

    // --- v3, made later, joins it from the library; the final track cannot ---
    await page.goto('/')
    const finalRow = page.getByTestId('track-row').filter({ hasText: 'Morning light' })
    await finalRow.getByRole('button', { name: 'Actions for Morning light' }).click()
    await expect(page.getByRole('menuitem', { name: 'Add to playlist' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Add to group' })).toHaveCount(0)
    await page.keyboard.press('Escape')
    const libraryRow = page.getByTestId('track-row').filter({ hasText: 'Night drive v3' })
    await libraryRow.getByRole('button', { name: 'Actions for Night drive v3' }).click()
    await page.getByRole('menuitem', { name: 'Add to group' }).click()
    // Its own song's group first, though "Rain" is newer.
    await expect(page.getByRole('menu').last().getByRole('menuitem')).toHaveText(['Night drive – versions', 'Rain – versions'])
    await page.getByRole('menuitem', { name: 'Night drive – versions' }).click()
    await expect(page.getByText('Added to Night drive – versions').first()).toBeVisible()

    await page.goto(`/versions/${group.id}`)
    await expectVersions(page, ['Night drive v1', 'Night drive v2', 'Night drive v3'])

    // --- v3 out from its menu, then back through the group's own "Add versions" ---
    const versionRow = page.getByTestId('playlist-track').filter({ hasText: 'Night drive v3' })
    await versionRow.getByRole('button', { name: 'Actions for Night drive v3' }).click()
    await page.getByRole('menuitem', { name: 'Remove from group' }).click()
    await expectVersions(page, ['Night drive v1', 'Night drive v2'])
    await page.getByTestId('playlist-add-tracks').click()
    const dialog = page.getByRole('dialog')
    // The search starts from the group's song; cleared, it offers every draft not in the
    // group yet (not the final track).
    const search = dialog.getByTestId('add-tracks-search')
    await expect(search).toHaveValue('Night drive')
    await expect(dialog.getByTestId('add-tracks-option')).toHaveText([/Night drive v3/])
    await search.fill('')
    await expect(dialog.getByTestId('add-tracks-option')).toHaveText([/Rainbow/, /Night drive v3/])
    await search.fill('v1')
    await expect(dialog.getByTestId('add-tracks-empty')).toHaveText('No track matches the search.')
    await search.fill('drive')
    await dialog.getByRole('checkbox', { name: 'Night drive v3' }).click()
    await dialog.getByRole('button', { name: 'Add 1 version' }).click()
    await expectVersions(page, ['Night drive v1', 'Night drive v2', 'Night drive v3'])

    // Every version of the song is in: the search starts empty, not from a name finding nothing.
    await page.getByTestId('playlist-add-tracks').click()
    await expect(search).toHaveValue('')
    await expect(dialog.getByTestId('add-tracks-option')).toHaveText([/Rainbow/])
    await dialog.getByRole('button', { name: 'Cancel' }).click()

    // Saved, not only on screen.
    await page.reload()
    await expectVersions(page, ['Night drive v1', 'Night drive v2', 'Night drive v3'])
  })
})

/** The group's versions on its page, in order (waits for the list to settle). */
async function expectVersions(page: Page, titles: string[]) {
  await expect(page.getByTestId('playlist-track-title')).toHaveText(titles.map(title => new RegExp(`^${title}`)))
}
