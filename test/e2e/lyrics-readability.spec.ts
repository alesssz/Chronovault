/**
 * End-to-end, lyrics stay readable in the light theme:
 * - the Sync tab's markers carry their line on a chip as wide as the text, cut before the next
 *   marker (each label shrank to its number inside the marker's 2px region, the rest of the line
 *   spilling white onto the light theme's pale waveform);
 * - a shared track's lyrics read as text before Play, and the lines still to come stay readable
 *   while it plays (they were pale grey on near-white, 2.6:1).
 * Contrast is measured on the colours the browser resolves, the line over the backgrounds under it.
 */
import { expect, test, type Locator, type Page } from './fixtures'
import { signUp, uploadTrack, waitForHydration } from './helpers'

/** Text needs 4.5:1 (WCAG AA); large text (24px, or 18.7px bold) 3:1. */
const TEXT_CONTRAST = 4.5
const LARGE_TEXT_CONTRAST = 3

/** The light theme, chosen before any script of the page runs. */
async function useLightTheme(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('nuxt-color-mode', 'light'))
}

/** Gives the only track of the library synced lyrics (and a visibility), through the API. */
async function setLyrics(page: Page, lines: { time: number, text: string }[], visibility = 'private'): Promise<string> {
  return page.evaluate(async ({ lines, visibility }) => {
    // The only track of the library.
    const [track] = await (await fetch('/api/tracks')).json() as { id: string }[]
    await fetch(`/api/tracks/${track!.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lyrics: lines.map(l => l.text).join('\n'), lyricsSynced: lines, visibility }),
    })
    return track!.id
  }, { lines, visibility })
}

/**
 * The contrast of an element's text on what is painted under it (its own background and its
 * ancestors', composited on white), its colour transition finished first.
 */
function contrastOf(locator: Locator): Promise<{ ratio: number, large: boolean }> {
  return locator.evaluate((element) => {
    for (const animation of element.getAnimations()) animation.finish()
    const context = document.createElement('canvas').getContext('2d')!
    /** The pixel the colours make painted in order on white, as RGB 0–255. */
    const paint = (colors: string[]) => {
      context.clearRect(0, 0, 1, 1)
      for (const color of ['white', ...colors]) {
        context.fillStyle = color
        context.fillRect(0, 0, 1, 1)
      }
      return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3)
    }
    /** WCAG relative luminance. */
    const luminance = (rgb: number[]) => {
      const [r, g, b] = rgb.map(v => v / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
    }
    // The backgrounds from the page down to the element.
    const backgrounds: string[] = []
    for (let node: Element | null = element; node; node = node.parentElement) backgrounds.unshift(getComputedStyle(node).backgroundColor)
    const style = getComputedStyle(element)
    const [light, dark] = [luminance(paint(backgrounds)), luminance(paint([...backgrounds, style.color]))].sort((a, b) => b - a)
    const size = Number.parseFloat(style.fontSize)
    return {
      ratio: Math.round(((light! + 0.05) / (dark! + 0.05)) * 100) / 100,
      large: size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700),
    }
  })
}

test.describe('lyrics readability', () => {
  test('Sync markers carry their line on a chip that ends before the next marker', async ({ page }) => {
    await useLightTheme(page)
    await signUp(page)
    // Long enough to keep playing for the whole test.
    await uploadTrack(page, 'Marked lines', { seconds: 30 })
    await setLyrics(page, [
      { time: 1, text: 'Under the ash of a burning sky over the walls' },
      { time: 2.2, text: 'The legions march where the rivers die' },
      { time: 6, text: 'Iron and salt' },
      { time: 6.6, text: 'A thousand names that the sea took in' },
    ])
    // The track playing (the Sync waveform follows the player), then its edit page.
    await page.getByRole('link', { name: 'Go to library' }).click()
    const row = page.getByTestId('track-row').filter({ hasText: 'Marked lines' })
    await row.getByTestId('track-title').click()
    await row.getByRole('button', { name: 'Actions for Marked lines' }).click()
    await page.getByRole('menuitem', { name: 'Edit' }).click()
    await page.getByRole('tab', { name: 'Sync' }).click()
    // The labels live in wavesurfer's (open) shadow root; Playwright's locators reach into it.
    const labels = page.getByTestId('sync-marker')
    await expect(labels).toHaveCount(4, { timeout: 20_000 })

    const boxes = await labels.evaluateAll(list => list.map(label => ({
      text: label.textContent,
      left: label.getBoundingClientRect().left,
      right: label.getBoundingClientRect().right,
      width: label.getBoundingClientRect().width,
      // The text overflowing the chip (the chip clips it, with an ellipsis).
      clipped: getComputedStyle(label).overflow === 'hidden',
      // Where the marker itself stands: the region's left edge.
      marker: label.parentElement!.getBoundingClientRect().left,
    })).sort((a, b) => a.marker - b.marker))
    for (const [i, box] of boxes.entries()) {
      // Wider than its number ("1. "): the old label shrank to the 2px region, about 12px.
      expect(box.width, `label ${box.text}`).toBeGreaterThan(40)
      expect(box.clipped, `label ${box.text} keeps its text inside`).toBe(true)
      // Ends before the next marker.
      const next = boxes[i + 1]
      if (next) expect(box.right, `label ${box.text}`).toBeLessThanOrEqual(next.marker)
    }
  })

  test('a shared track\'s lyrics read as text before Play, and the lines to come while it plays', async ({ page, browser }) => {
    await signUp(page)
    await uploadTrack(page, 'Readable lyrics', { seconds: 30 })
    const id = await setLyrics(page, [
      { time: 0.3, text: 'Under the ash of a burning sky' },
      { time: 20, text: 'The legions march where the rivers die' },
      { time: 22, text: 'Iron and salt on the morning wind' },
    ], 'unlisted')

    // A visitor, in the light theme.
    const visitor = await browser.newContext()
    const share = await visitor.newPage()
    await useLightTheme(share)
    await share.goto(`/t/${id}`)
    await waitForHydration(share)
    const lines = share.getByTestId('lyrics-synced').getByRole('button')
    await expect(lines).toHaveCount(3)

    // Before Play: every line is text (all dimmed, they read at 2.6:1).
    for (const line of await lines.all()) {
      expect((await contrastOf(line)).ratio, `${await line.textContent()} before Play`).toBeGreaterThanOrEqual(TEXT_CONTRAST)
    }

    // Playing: the first line sung, the two to come still readable (large text).
    await share.getByTestId('shared-play').click()
    await expect(lines.first()).toHaveAttribute('aria-current', 'true')
    for (const line of (await lines.all()).slice(1)) {
      const { ratio, large } = await contrastOf(line)
      expect(large, 'lyrics lines are large text').toBe(true)
      expect(ratio, `${await line.textContent()} while playing`).toBeGreaterThanOrEqual(LARGE_TEXT_CONTRAST)
    }
    await visitor.close()
  })
})
