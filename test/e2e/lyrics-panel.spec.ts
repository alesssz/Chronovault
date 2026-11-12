/**
 * End-to-end, the share pages' lyrics panels with scrollbars that take room (Windows, Linux, a
 * Mac set to always show them): the scrollbar runs along the panel's border, not 1.5rem (30px)
 * inside it with a strip of empty panel beyond, and centred lines stay on the panel's middle
 * instead of half a scrollbar (7.5px) to its left. Checked on the track page and on the
 * playlist page, both with centred lyrics.
 *
 * Headless Chromium hides scrollbars (`--hide-scrollbars`, one of Playwright's default
 * arguments): they take no room, and the centring could not go wrong. This file runs without
 * it, so they take their 15px; a launch option, so it is set for the whole file (a worker of
 * its own), not for one test.
 */
import { expect, test, type Page } from './fixtures'
import { signUp, uploadTrack, waitForHydration } from './helpers'

// Real scrollbars for every test of this file (see above).
test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } })

test('the scrollbar runs along the panel\'s border, and centred lines stay centred', async ({ page, browser }) => {
  await signUp(page)
  await uploadTrack(page, 'Framed lyrics')
  await page.getByRole('link', { name: 'Go to library' }).click()
  // Sixty plain lines (the panel scrolls), the track and a playlist of it shared by link.
  const { trackId, playlistId } = await page.evaluate(async () => {
    const [track] = await (await fetch('/api/tracks')).json() as { id: string }[]
    const lyrics = Array.from({ length: 60 }, (_, i) => `Line ${i + 1} of the song`).join('\n')
    await fetch(`/api/tracks/${track!.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ visibility: 'unlisted', lyrics }),
    })
    const response = await fetch('/api/playlists', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Framed', visibility: 'unlisted', trackIds: [track!.id] }),
    })
    return { trackId: track!.id, playlistId: (await response.json() as { id: string }).id }
  })

  /**
   * The panel's frame against its scrolling box and first line: the box's right edge on the
   * panel's inner edge (the padding used to be the panel's, leaving the scrollbar 30px inside
   * it), and the line's middle on the panel's (a scrollbar on the right alone pulled every
   * centred line half its width to the left).
   */
  async function expectFramed(visitor: Page) {
    // The framed panel, and LyricsView's scrolling box inside it.
    const panel = visitor.getByTestId('shared-lyrics')
    const box = panel.locator('.overflow-y-auto').first()
    // The lyrics are in and overflow the box: it has a scrollbar to measure against.
    await expect(box).toHaveAttribute('data-more-below', 'true')
    const measured = await panel.evaluate((element) => {
      const frame = element.getBoundingClientRect()
      const scroller = element.querySelector('.overflow-y-auto')!
      // The first line of the plain lyrics.
      const line = scroller.querySelector('p')!
      // The text itself, not its full-width paragraph.
      const range = document.createRange()
      range.selectNodeContents(line)
      const text = range.getBoundingClientRect()
      return {
        // Inside the panel's 1px border (clientLeft: the border's width, alike on both sides).
        innerRight: frame.right - element.clientLeft,
        boxRight: scroller.getBoundingClientRect().right,
        panelMiddle: frame.left + frame.width / 2,
        lineMiddle: text.left + text.width / 2,
      }
    })
    expect(Math.abs(measured.boxRight - measured.innerRight)).toBeLessThanOrEqual(1)
    expect(Math.abs(measured.lineMiddle - measured.panelMiddle)).toBeLessThanOrEqual(1)
  }

  // A visitor on a desktop screen, where the lyrics panel sits beside the cover or the list.
  const visitorContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  try {
    const visitor = await visitorContext.newPage()
    // The track's page: the lyrics panel beside the cover.
    await visitor.goto(`/t/${trackId}`)
    await waitForHydration(visitor)
    await expectFramed(visitor)
    // The playlist's page: the panel beside the list, for the track it shows.
    await visitor.goto(`/p/${playlistId}`)
    await waitForHydration(visitor)
    await expectFramed(visitor)
  }
  finally {
    await visitorContext.close()
  }
})
