/**
 * End-to-end, saved queue: after a reload the player comes back with the
 * same track, paused at the same position, and the same upcoming tracks;
 * closing the player forgets it.
 */
import { expect, test } from '@playwright/test'
import { signUp, uniqueId, uploadTrack } from './helpers'

test.describe('saved queue', () => {
  test('a reload resumes the queue; closing the player forgets it', async ({ page }) => {
    await signUp(page)
    // Two tracks named uniquely for this test.
    const id = uniqueId()
    const [first, second] = [`first-${id}`, `second-${id}`]
    // Long enough not to end during the test.
    for (const title of [first, second]) await uploadTrack(page, title, { seconds: 120 })
    await page.goto('/')

    // Newest first: playing "second" leaves "first" up next.
    await page.getByTestId('track-row').filter({ hasText: second }).getByTestId('track-title').click()
    // The player bar and its play button (the one on screen).
    const bar = page.getByTestId('player-bar')
    const toggle = bar.locator('[data-testid="player-toggle"]:visible')
    await expect(toggle).toHaveAttribute('aria-label', 'Pause')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-label', 'Play')

    // Move to 0:10 with the waveform's keyboard control (5 s per step).
    const waveform = bar.getByRole('slider', { name: 'Position in track' })
    await waveform.focus()
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await expect(bar.getByTestId('player-elapsed')).toHaveText('0:10')

    // --- Reload: same track, paused, same position, same queue ---
    await page.reload()
    await expect(bar.getByTestId('player-title')).toHaveText(second)
    await expect(toggle).toHaveAttribute('aria-label', 'Play')
    await expect(bar.getByTestId('player-elapsed')).toHaveText('0:10')
    await bar.getByTestId('player-queue').click()
    await expect(page.getByTestId('queue-item-title')).toHaveText([first])
    await page.keyboard.press('Escape')

    // It plays from there.
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-label', 'Pause')
    await toggle.click()

    // --- Closing the player forgets the queue ---
    await bar.getByRole('button', { name: 'Close player' }).click()
    await expect(bar).toBeHidden()
    await page.reload()
    await expect(page.getByTestId('track-row')).toHaveCount(2)
    await expect(bar).toBeHidden()
  })
})
