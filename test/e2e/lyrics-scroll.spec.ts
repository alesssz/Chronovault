/**
 * End-to-end, synced lyrics follow playback inside their own box and never move the page: on a
 * phone the share page's lyrics sit in the page's flow, under the player, and a visitor who
 * scrolled back up (to the track list, the vote buttons…) must stay there while every new line
 * scrolls the lyrics box alone. scrollIntoView used to scroll the whole page down to each line.
 */
import { expect, test } from './fixtures'
import { signUp, uploadTrack, waitForHydration } from './helpers'

test.describe('synced lyrics scrolling', () => {
  test('a new line scrolls the lyrics box, never the page', async ({ page, browser }) => {
    await signUp(page)
    // Long enough for many lines to go by while the test watches.
    await uploadTrack(page, 'Scrolling lyrics', { seconds: 60 })
    await page.getByRole('link', { name: 'Go to library' }).click()

    // The track shared by link, with eighty synced lines, one every 0.4 s: far more than the box shows.
    const id = await page.evaluate(async () => {
      // The track just uploaded (the only one).
      const [track] = await (await fetch('/api/tracks')).json() as { id: string }[]
      // The synced lines, and the same text as plain lyrics.
      const lines = Array.from({ length: 80 }, (_, i) => ({ time: i * 0.4, text: `Line ${i + 1} of the song` }))
      const response = await fetch(`/api/tracks/${track!.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ visibility: 'unlisted', lyricsSynced: lines, lyrics: lines.map(l => l.text).join('\n') }),
      })
      if (!response.ok) throw new Error(`PATCH failed: ${response.status}`)
      return track!.id
    })

    // A visitor on a phone-sized screen.
    const visitorContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
    try {
      // The visitor's page.
      const visitor = await visitorContext.newPage()
      await visitor.goto(`/t/${id}`)
      await waitForHydration(visitor)
      await visitor.getByTestId('shared-play').click()

      // Back to the top of the page, as a visitor scrolling up to the player would be.
      await visitor.evaluate(() => window.scrollTo(0, 0))
      // The lyrics box, and its scroll position read in the page.
      const box = visitor.getByTestId('shared-lyrics').locator('.overflow-y-auto').first()
      const boxScroll = () => box.evaluate(el => el.scrollTop)

      // The lines go by: the box follows them…
      await expect.poll(boxScroll, { timeout: 15_000 }).toBeGreaterThan(200)
      // …and the page has not moved.
      expect(await visitor.evaluate(() => window.scrollY)).toBe(0)
    }
    finally {
      await visitorContext.close()
    }
  })
})
