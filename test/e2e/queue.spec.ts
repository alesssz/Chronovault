/**
 * End-to-end, editable queue: "Add to queue" and "Play next" from the library
 * menu, then the Up next panel: order, move, remove, play now, clear; shuffle
 * reorders it and puts it back, repeat one restarts the track.
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

  test('shuffle reorders the upcoming tracks and puts them back; repeat one restarts the track', async ({ page }) => {
    // The bar shows shuffle and repeat from 1280 px (xl): stay clear of that edge.
    await page.setViewportSize({ width: 1440, height: 900 })
    await signUp(page)
    const id = uniqueId()
    const titles = ['a', 'b', 'c', 'd', 'e'].map(letter => `s${letter}-${id}`)
    for (const title of titles) await uploadTrack(page, title)
    await page.getByRole('link', { name: 'Go to library' }).click()

    // Newest first: playing the last upload leaves the other four, newest first, up next.
    const [first, ...rest] = [...titles].reverse() as [string, ...string[]]
    await page.getByTestId('track-row').filter({ hasText: first }).getByTestId('track-title').click()
    const bar = page.getByTestId('player-bar')
    const toggle = bar.locator('[data-testid="player-toggle"]:visible')
    await expect(toggle).toHaveAttribute('aria-label', 'Pause')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-label', 'Play')

    /** The Up next titles, read from the panel (opened, then closed again). */
    const upNext = async () => {
      await bar.getByTestId('player-queue').click()
      const items = page.getByTestId('queue-item-title')
      await expect(items).toHaveCount(rest.length)
      const texts = await items.allTextContents()
      await page.keyboard.press('Escape')
      await expect(page.getByTestId('queue-list')).toBeHidden()
      return texts.map(text => text.trim())
    }
    expect(await upNext()).toEqual(rest)

    // --- Shuffle: the same tracks in another order (4 tracks: 1 chance in 24 of the same order, so retry) ---
    const shuffleButton = bar.getByTestId('player-shuffle')
    let shuffledOrder = rest
    for (let attempt = 0; attempt < 5 && shuffledOrder.join() === rest.join(); attempt++) {
      if (attempt > 0) await shuffleButton.click()
      await shuffleButton.click()
      await expect(shuffleButton).toHaveAttribute('aria-label', 'Shuffle: on')
      shuffledOrder = await upNext()
    }
    expect(shuffledOrder).not.toEqual(rest)
    expect([...shuffledOrder].sort()).toEqual([...rest].sort())

    // --- Shuffle off: back in order ---
    await shuffleButton.click()
    await expect(shuffleButton).toHaveAttribute('aria-label', 'Shuffle: off')
    expect(await upNext()).toEqual(rest)

    // --- Repeat one: the 3-second track starts again instead of moving on ---
    const repeatButton = bar.getByTestId('player-repeat')
    await repeatButton.click()
    await repeatButton.click()
    await expect(repeatButton).toHaveAttribute('aria-label', 'Repeat: one')
    await toggle.click()
    const elapsed = bar.getByTestId('player-elapsed')
    await expect(elapsed).toHaveText('0:02')
    await expect(elapsed).toHaveText(/^0:0[01]$/)
    await expect(bar.getByTestId('player-title')).toHaveText(first)
    await expect(toggle).toHaveAttribute('aria-label', 'Pause')
    await toggle.click()
  })
})
