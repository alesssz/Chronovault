/**
 * End-to-end, touch screens: the phone and tablet layouts (Playwright projects `phone` and
 * `tablet`, see playwright.config.ts; the desktop project skips this file). No page scrolls
 * sideways, track covers show that they play without needing a hover, the tablet player bar
 * keeps a readable title and reaches the volume through a popover, and on phones the lyrics
 * sync editor keeps Stamp line pinned above the player bar.
 */
import { expect, test, type Page } from '@playwright/test'
import { signUp, uploadTrack } from './helpers'

/** Pages of the signed-in app that must fit the screen width. */
const PAGES = ['/', '/playlists', '/versions', '/stats', '/tracks/new']

/** Fails when the page is wider than the screen (it would scroll sideways). */
async function expectNoSidewaysScroll(page: Page, path: string): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(scrollWidth, `${path} scrolls sideways`).toBeLessThanOrEqual(clientWidth)
}

/** Id of the signed-in user's first track (newest first). */
async function firstTrackId(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const tracks = await (await fetch('/api/tracks')).json() as { id: string }[]
    return tracks[0]!.id
  })
}

/**
 * A new user with one track, on the library. Called inside each test, after its
 * project check: a test skipped on this layout does not pay for the sign-up and upload.
 */
async function signUpWithTrack(page: Page): Promise<void> {
  await signUp(page)
  await uploadTrack(page, 'Touch screen song')
  await page.goto('/')
  await expect(page.getByTestId('track-row')).toHaveCount(1)
}

test.describe('touch screens', () => {
  test('pages fit the screen and covers show their play button', async ({ page }) => {
    await signUpWithTrack(page)
    for (const path of PAGES) {
      await page.goto(path)
      // The header is there on every page: the page has rendered.
      await expect(page.getByRole('navigation', { name: 'Sections' })).toBeVisible()
      await expectNoSidewaysScroll(page, path)
    }

    // No hover on a touch screen: the play overlay is on even for a track that is not playing.
    await page.goto('/')
    await expect(page.getByTestId('track-cover-overlay')).toHaveCSS('opacity', '1')

    // The edit page (its tabs and lyrics tools) fits too.
    await page.goto(`/tracks/${await firstTrackId(page)}/edit`)
    await expect(page.getByRole('tab', { name: 'Sync' })).toBeVisible()
    await expectNoSidewaysScroll(page, '/tracks/[id]/edit')
  })

  test('tablet: player bar with a readable title and the volume in a popover', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'tablet', 'tablet layout only')
    await signUpWithTrack(page)

    await page.getByTestId('track-title').tap()
    const bar = page.getByTestId('player-bar')
    await expect(bar).toBeVisible()
    // The two-row bar of md+: waveform and the full controls.
    await expect(bar.getByTestId('player-waveform')).toBeVisible()

    // The title column keeps a real width (it used to shrink to a few letters).
    const title = await bar.getByTestId('player-title').boundingBox()
    expect(title!.width).toBeGreaterThan(140)

    // The inline slider does not fit here: one speaker button opens it in a popover.
    await bar.getByTestId('player-volume-compact').tap()
    await expect(page.getByRole('slider', { name: 'Volume' })).toBeVisible()
  })

  test('phone: Stamp line stays pinned above the player bar while syncing', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'phone layout only')
    await signUpWithTrack(page)

    // Enough lyrics to make the page scroll, then the Sync tab with the track in the player.
    await page.goto(`/tracks/${await firstTrackId(page)}/edit`)
    await page.getByRole('tab', { name: 'Lyrics' }).tap()
    const lines = Array.from({ length: 30 }, (_, i) => `Line number ${i + 1}`)
    await page.getByTestId('field-lyrics').fill(lines.join('\n'))
    await page.getByRole('tab', { name: 'Sync' }).tap()
    await page.getByRole('button', { name: 'Load in player' }).tap()
    await page.getByRole('button', { name: 'Reload from lyrics' }).tap()

    // The desktop button gives way to the pinned bar.
    await expect(page.getByTestId('sync-stamp')).toBeHidden()
    const stamp = page.getByTestId('sync-stamp-mobile')
    await expect(stamp).toBeVisible()

    // Scrolled to the middle of the lines, the bar is still on screen, right above the player bar.
    await page.getByTestId('sync-row-text').nth(15).scrollIntoViewIfNeeded()
    await expect(stamp).toBeInViewport()
    const bar = await page.getByTestId('sync-stamp-bar').boundingBox()
    const player = await page.getByTestId('player-bar').boundingBox()
    expect(bar!.y + bar!.height).toBeLessThanOrEqual(player!.y)

    // A tap stamps the next line.
    await stamp.tap()
    await expect(page.getByText('1 / 30 lines synced')).toBeVisible()
  })
})
