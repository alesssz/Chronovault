/**
 * End-to-end, draft versions: new uploads are drafts; several versions are
 * sent to friends in one "Share for feedback" link (marked "WIP" there);
 * the group shows up on the Versions page, not among the playlists; the
 * chosen one is marked final from the group; the others are deleted in one go.
 */
import { expect, test } from '@playwright/test'
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
    /** The library row of a version. */
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
})
