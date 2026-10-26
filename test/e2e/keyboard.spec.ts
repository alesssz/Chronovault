/**
 * End-to-end, the player's keyboard shortcuts: nothing on an empty player (and ? lists them);
 * Space play/pause, ← / → five seconds, Shift + ← / → previous / next track, M mute, F the
 * full-screen view (and F again closes it, from inside it). They wait where a key means
 * something else: typing in the search box, Space on a focused button (it clicks it once, not
 * twice), and the lyrics sync editor, which keeps Space to stamp a line.
 */
import { expect, test, type Page } from './fixtures'
import { signUp, uploadTrack } from './helpers'

/** "1:05" → 65: the times the player bar shows. */
function seconds(text: string): number {
  // Minutes and seconds, as written.
  const [minutes, rest] = text.trim().split(':')
  return Number(minutes) * 60 + Number(rest)
}

/** Takes the focus off whatever has it (the button just clicked): the keys then reach the page. */
function blur(page: Page) {
  return page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
}

test.describe('keyboard shortcuts', () => {
  test('drive the player, and wait where a key means something else', async ({ page }) => {
    test.setTimeout(120_000)
    await signUp(page)
    // Two 20-second tracks: room for five-second steps. The library shows the newest first.
    for (const title of ['Key A', 'Key B']) await uploadTrack(page, title, { seconds: 20 })
    // Plain lyrics on "Key B", for the sync editor at the end.
    await page.evaluate(async () => {
      // The new account's tracks.
      const tracks = await (await fetch('/api/tracks')).json() as { id: string, title: string }[]
      // "Key B", the one that gets lyrics.
      const id = tracks.find(t => t.title === 'Key B')!.id
      await fetch(`/api/tracks/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lyrics: 'First line\nSecond line' }),
      })
    })
    await page.goto('/')
    // The player bar and, in it, the play button and the elapsed time.
    const bar = page.getByTestId('player-bar')
    // The bar has a phone and a desktop set of controls: the one on screen.
    const toggle = bar.getByTestId('player-toggle').filter({ visible: true })
    // The elapsed time, to check the five-second steps.
    const elapsed = bar.getByTestId('player-elapsed')

    // --- An empty player: Space does nothing, ? lists the shortcuts ---
    await expect(page.getByTestId('track-row')).toHaveCount(2)
    await page.keyboard.press('Space')
    await expect(bar).toHaveCount(0)
    await page.keyboard.press('Shift+?')
    await expect(page.getByTestId('keyboard-shortcuts')).toContainText('Play / pause')
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('keyboard-shortcuts')).toHaveCount(0)

    // --- Play "Key B" (then "Key A" comes next) ---
    await page.getByTestId('track-row').filter({ hasText: 'Key B' }).getByTestId('track-title').click()
    await expect(toggle).toHaveAccessibleName('Pause')
    await blur(page)

    // Space: pause, and play again.
    await page.keyboard.press('Space')
    await expect(toggle).toHaveAccessibleName('Play')
    await page.keyboard.press('Space')
    await expect(toggle).toHaveAccessibleName('Pause')

    // ← / →: five seconds, checked while paused (the time stands still).
    await page.keyboard.press('Space')
    await expect(toggle).toHaveAccessibleName('Play')
    // Where the five-second steps start from.
    const start = seconds(await elapsed.innerText())
    await page.keyboard.press('ArrowRight')
    await expect.poll(async () => seconds(await elapsed.innerText())).toBe(start + 5)
    await page.keyboard.press('ArrowLeft')
    await expect.poll(async () => seconds(await elapsed.innerText())).toBe(start)

    // Shift + → / ←: next track, then back (within the first seconds: the previous track).
    await page.keyboard.press('Shift+ArrowRight')
    await expect(bar.getByTestId('player-title')).toHaveText('Key A')
    await page.keyboard.press('Shift+ArrowLeft')
    await expect(bar.getByTestId('player-title')).toHaveText('Key B')

    // M: mute, and back.
    await page.keyboard.press('m')
    await expect(bar.getByRole('button', { name: 'Unmute' })).toBeVisible()
    await page.keyboard.press('m')
    await expect(bar.getByRole('button', { name: 'Mute' })).toBeVisible()

    // F: the full-screen view, and F again from inside it closes it.
    await page.keyboard.press('f')
    await expect(page.getByTestId('player-expanded')).toBeVisible()
    await page.keyboard.press('f')
    await expect(page.getByTestId('player-expanded')).toBeHidden()

    // --- Typing in the search box: letters are text, not shortcuts ---
    const search = page.getByRole('textbox', { name: 'Search the library' })
    await search.click()
    await page.keyboard.type('mf')
    await expect(search).toHaveValue('mf')
    await expect(bar.getByRole('button', { name: 'Unmute' })).toHaveCount(0)
    await expect(page.getByTestId('player-expanded')).toBeHidden()
    await search.fill('')

    // --- Space on a focused button clicks it once (no second toggle from the shortcut) ---
    // Paused first (Shift + arrows started the tracks they moved to).
    await blur(page)
    await page.keyboard.press('Space')
    await expect(toggle).toHaveAccessibleName('Play')
    await toggle.focus()
    await page.keyboard.press('Space')
    await expect(toggle).toHaveAccessibleName('Pause')
    // Still playing a moment later: nothing toggled it back.
    await page.waitForTimeout(300)
    await expect(toggle).toHaveAccessibleName('Pause')

    // --- The lyrics sync editor keeps Space: it stamps a line, the music goes on ---
    const row = page.getByTestId('track-row').filter({ hasText: 'Key B' })
    await row.getByRole('button', { name: 'Actions for Key B' }).click()
    await page.getByRole('menuitem', { name: 'Edit' }).click()
    await page.getByRole('tab', { name: 'Sync' }).click()
    await expect(page.getByText('0 / 2 lines synced')).toBeVisible()
    await blur(page)
    await page.keyboard.press('Space')
    await expect(page.getByText('1 / 2 lines synced')).toBeVisible()
    await expect(toggle).toHaveAccessibleName('Pause')
  })
})
