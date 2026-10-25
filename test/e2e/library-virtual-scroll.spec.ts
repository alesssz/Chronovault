/**
 * End-to-end, a large library (300 tracks) with the virtual scroll: only the rows around the
 * screen are in the page, yet the list keeps its full height and screen readers hear its full
 * length; scrolling to the end brings the oldest tracks; search, "select all" and playing from a
 * row work on the whole library; and coming back from a track's page restores the place in the
 * list.
 */
import { expect, test, type Page } from '@playwright/test'
import { seedLibrary, signUp } from './helpers'

/** Tracks in the library: well beyond what a screen shows. */
const COUNT = 300

/** Titles of the rows currently in the page. */
function renderedTitles(page: Page): Promise<string[]> {
  return page.getByTestId('track-row').locator('[data-testid="track-title"] p:first-child').allInnerTexts()
}

/** The title of the first row whose top is below the sticky header (what the eye lands on). */
function firstTitleOnScreen(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    // The header is sticky: rows behind it are not "on screen".
    const below = document.querySelector('header')?.getBoundingClientRect().bottom ?? 0
    const rows = [...document.querySelectorAll<HTMLElement>('[data-testid="track-row"]')]
      .filter(row => row.getBoundingClientRect().top >= below)
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
    return rows[0]?.querySelector('[data-testid="track-title"] p')?.textContent?.trim() ?? null
  })
}

test.describe('library with many tracks', () => {
  test('draws only the rows on screen, yet works on the whole library', async ({ page }) => {
    test.setTimeout(180_000)
    await signUp(page)
    await seedLibrary(page, COUNT)
    await page.goto('/')

    // --- Only a screenful (and a margin) of rows in the page, out of 300 ---
    const rows = page.getByTestId('track-row')
    await expect(rows.first()).toBeVisible()
    // Polled: the first frames may still be settling (the window's size, the list's place).
    await expect.poll(() => rows.count()).toBeGreaterThan(5)
    await expect.poll(() => rows.count()).toBeLessThan(60)
    // Screen readers hear where a row stands in the whole list.
    await expect(rows.first()).toHaveAttribute('aria-setsize', String(COUNT))
    await expect(rows.first()).toHaveAttribute('aria-posinset', '1')
    // The list is as tall as all its rows: the page can scroll through every one.
    const listHeight = await page.evaluate(() => document.querySelector<HTMLElement>('[data-testid="track-row"]')!.parentElement!.offsetHeight)
    expect(listHeight).toBeGreaterThan(COUNT * 50)

    // --- The end of the list: the oldest tracks (the first batch made) ---
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await expect(rows.last()).toHaveAttribute('aria-posinset', String(COUNT))
    await expect.poll(() => renderedTitles(page)).toEqual(expect.arrayContaining([expect.stringMatching(/^Track 0(0\d|10)$/)]))
    await expect.poll(() => rows.count()).toBeLessThan(60)
    await page.evaluate(() => window.scrollTo(0, 0))

    // --- Search reaches every track, not just the drawn ones ---
    const search = page.getByRole('textbox', { name: 'Search the library' })
    await search.fill('Track 150')
    await expect(rows).toHaveCount(1)
    await expect(rows.first()).toContainText('Track 150')
    await search.fill('')
    await expect(rows.first()).toHaveAttribute('aria-setsize', String(COUNT))

    // --- "Select all" selects the whole library ---
    await page.getByTestId('select-mode').click()
    await page.getByRole('checkbox', { name: 'Select all' }).click()
    await expect(page.getByTestId('selection-count')).toHaveText(`${COUNT} selected`)
    await page.getByRole('checkbox', { name: 'Select all' }).click()
    await page.getByTestId('select-mode').click()

    // --- Playing from a row queues the whole library (saved on the device) ---
    await rows.nth(3).getByTestId('track-title').click()
    await expect(page.getByTestId('player-bar')).toBeVisible()
    await expect.poll(() => page.evaluate(() => (JSON.parse(localStorage.getItem('chronovault:queue') ?? '{}') as { trackIds?: string[] }).trackIds?.length))
      .toBe(COUNT)
    // Out of the way for the next step: the player bar covers the bottom of the page.
    await page.getByRole('button', { name: 'Close player' }).click()

    // --- Back from a track's page, the list is where it was ---
    await page.evaluate(() => window.scrollTo(0, 9000))
    await expect.poll(() => firstTitleOnScreen(page)).not.toBeNull()
    // The title at the top of the screen before leaving the list.
    const before = await firstTitleOnScreen(page)
    // Its row.
    const row = rows.filter({ hasText: before! })
    await row.getByRole('button', { name: `Actions for ${before}` }).click()
    await page.getByRole('menuitem', { name: 'Edit' }).click()
    await expect(page).toHaveURL(/\/tracks\/[0-9a-f-]{36}\/edit$/)
    // As a person would: the track's page on screen (with its title) before going back. Going
    // back within milliseconds of the click, while that page is still loading, is not a case
    // anyone meets, and the position can then be lost on the way.
    await expect(page.getByLabel('Title')).toHaveValue(before!)
    await page.goBack()
    await expect(page).toHaveURL(/\/$/)
    await expect.poll(() => firstTitleOnScreen(page)).toBe(before)
  })
})
