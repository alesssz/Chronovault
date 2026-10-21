/**
 * End-to-end, editable queue: "Add to queue" and "Play next" from the library
 * menu, then the Up next panel: order, move, remove, play now, clear.
 */
import { expect, test, type Page } from '@playwright/test'
import { signUp, uniqueId, uploadTrack } from './helpers'

/** Opens a library row's menu and picks an item. */
async function rowAction(page: Page, title: string, action: string) {
  const row = page.getByTestId('track-row').filter({ hasText: title })
  await row.getByRole('button', { name: `Actions for ${title}` }).click()
  await page.getByRole('menuitem', { name: action, exact: true }).click()
}

test.describe('editable queue', () => {
  test('add, play next, reorder, remove, play now and clear', async ({ page }) => {
    await signUp(page)
    const id = uniqueId()
    const [a, b, c] = [`qa-${id}`, `qb-${id}`, `qc-${id}`]
    for (const title of [a, b, c]) await uploadTrack(page, title)
    await page.getByRole('link', { name: 'Go to library' }).click()

    // The library shows the newest first (c, b, a): playing "a" leaves nothing after it.
    await page.getByTestId('track-row').filter({ hasText: a }).getByTestId('track-title').click()
    const bar = page.getByTestId('player-bar')
    await expect(bar.getByTestId('player-title')).toHaveText(a)

    await rowAction(page, c, 'Add to queue')
    await expect(page.getByText(`${c} added to the queue`).first()).toBeVisible()
    await rowAction(page, b, 'Play next')
    await expect(page.getByText(`${b} plays next`).first()).toBeVisible()
    await rowAction(page, a, 'Add to queue')
    await expect(page.getByText(`${a} is already playing`).first()).toBeVisible()

    // --- The Up next panel ---
    await bar.getByTestId('player-queue').click()
    await expect(page.getByTestId('queue-current')).toHaveText(a)
    const titles = page.getByTestId('queue-item-title')
    await expect(titles).toHaveText([b, c])

    await page.getByRole('button', { name: `Queue actions for ${b}` }).click()
    await page.getByRole('menuitem', { name: 'Move down' }).click()
    await expect(titles).toHaveText([c, b])

    await page.getByRole('button', { name: `Queue actions for ${b}` }).click()
    await page.getByRole('menuitem', { name: 'Remove from queue' }).click()
    await expect(titles).toHaveText([c])

    // Playing a queued track right away.
    await page.getByRole('button', { name: `Play ${c} now` }).click()
    await expect(page.getByTestId('queue-current')).toHaveText(c)
    await expect(bar.getByTestId('player-title')).toHaveText(c)
    await expect(page.getByText('Nothing up next')).toBeVisible()

    // The panel is modal: close it to use the library, then open it again.
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('queue-list')).toBeHidden()
    await rowAction(page, b, 'Add to queue')
    await bar.getByTestId('player-queue').click()
    await expect(titles).toHaveText([b])
    await page.getByTestId('queue-clear').click()
    await expect(page.getByText('Nothing up next')).toBeVisible()
  })
})
