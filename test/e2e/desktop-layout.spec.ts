/**
 * End-to-end, layout on a 1440×900 desktop, measured on the pages (the touch layouts are
 * responsive.spec.ts). Regressions found by a review of the interface:
 * - the library rows' genre and icons stand in columns (a genre badge as wide as its name moved
 *   the icons from row to row);
 * - the visibility cards are three equal columns (as a row of cards as wide as their text,
 *   Public sat alone on a second line); the track editor's rows are full (album, year and genre
 *   in thirds), its status switches in the left column under the cover (on a row of the form
 *   of their own, they left it looking empty);
 * - a playlist's page starts with its tracks, its details in a dialog (the form came first and
 *   pushed the tracks below the bottom edge);
 * - the share pages of a playlist and of a track keep Play, and the playlist its first track, in
 *   the first screen (a 26rem cover put them on or below the bottom edge); the playlist's, like the
 *   track's, has its player as a bar at the bottom (previous / next and full screen in it), its
 *   list in the top half and its now-playing panel ending above the bar;
 * - the full-screen player (the share page's layout) of a track without lyrics shows its
 *   description beside the cover, and with neither a single centred column (half the screen held
 *   only "No lyrics"); its controls bar stays inside the window down to 1280×720 and 1024×640;
 * - a shared track (TrackShowcase, the full-screen player's body too): the title, composers and
 *   album in a centred band over two columns; on the left a square cover as wide as the column
 *   and About under it; on the right the lyrics, exactly as tall, from the cover's top to About's
 *   end; the player bar at the bottom of the window, as wide as the content;
 * - Save is grey until something changed, then gold (disabled, it was the same gold, faded);
 * - the mastering filter's "no filter" reads as a choice ("Any mastering", it said "Mastering").
 */
import { expect, test, type Locator, type Page } from './fixtures'
import { signUp, uploadTrack, waitForHydration } from './helpers'

/** Two tracks: one with a description, one with nothing but its file. */
const TRACKS = ['Desk anthem', 'Desk ballad']

/**
 * A new account with the two tracks, unlisted, with genres of different lengths and a
 * description on the first; and an unlisted playlist of both. Returns the ids.
 */
async function seed(page: Page): Promise<{ playlist: string, ids: Record<string, string> }> {
  await signUp(page)
  for (const title of TRACKS) await uploadTrack(page, title)
  return page.evaluate(async (titles) => {
    // The tracks just uploaded, by title.
    const tracks = await (await fetch('/api/tracks')).json() as { id: string, title: string }[]
    const ids = Object.fromEntries(tracks.map(t => [t.title, t.id]))
    // A short genre name and a long one.
    const genres = await (await fetch('/api/genres')).json() as { id: string, name: string }[]
    const short = genres.find(g => g.name === 'Pop')!
    const long = genres.find(g => g.name === 'Classical')!
    /** Saves fields of a track. */
    const patch = (id: string, body: object) => fetch(`/api/tracks/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    await patch(ids[titles[0]!]!, { visibility: 'unlisted', genreId: short.id, description: 'Written for the desk.' })
    await patch(ids[titles[1]!]!, { visibility: 'unlisted', genreId: long.id })
    const response = await fetch('/api/playlists', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Desk playlist', visibility: 'unlisted', trackIds: titles.map(t => ids[t]) }),
    })
    return { playlist: (await response.json() as { id: string }).id, ids }
  }, TRACKS)
}

/** True when the button's background is the theme's primary colour (both resolved to pixels on a canvas). */
function isPrimary(button: Locator): Promise<boolean> {
  return button.evaluate((element) => {
    const context = document.createElement('canvas').getContext('2d')!
    /** The colour as an "r,g,b,a" pixel, whatever syntax the browser reports it in. */
    const pixel = (color: string) => {
      context.clearRect(0, 0, 1, 1)
      context.fillStyle = color
      context.fillRect(0, 0, 1, 1)
      return [...context.getImageData(0, 0, 1, 1).data].join(',')
    }
    // A custom property's computed value has its var() resolved: the step the theme uses.
    const primary = getComputedStyle(document.documentElement).getPropertyValue('--ui-primary')
    return pixel(getComputedStyle(element).backgroundColor) === pixel(primary)
  })
}

test.describe('desktop layout', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('rows in columns, even visibility cards, tracks and Play in the first screen, no empty half', async ({ page }) => {
    test.setTimeout(90_000)
    const { playlist, ids } = await seed(page)
    const height = 900

    // --- Library: genre and icons in columns ---
    await page.goto('/')
    const rows = page.getByTestId('track-row')
    await expect(rows).toHaveCount(2)
    // Where each row's genre and visibility icon start.
    const columns = await rows.evaluateAll(list => list.map(row => ({
      genre: row.querySelector('[data-testid="track-genre"]')!.getBoundingClientRect().x,
      visibility: row.querySelector('[data-testid="track-genre"] + div > :last-child')!.getBoundingClientRect().x,
    })))
    expect(columns[0]!.genre).toBe(columns[1]!.genre)
    expect(columns[0]!.visibility).toBe(columns[1]!.visibility)
    // The mastering filter with nothing chosen.
    await expect(page.getByRole('combobox', { name: 'Filter by mastering' })).toHaveText('Any mastering')
    // Keyboard focus on a row shows its play icon (the focus a tap gives, on phones, no longer
    // does: responsive.spec). Tab from the search box to the first row's cover.
    await page.getByRole('textbox', { name: /Search/ }).click()
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('Tab')
      if (await page.evaluate(() => !!document.activeElement?.closest('[data-testid="track-row"]'))) break
    }
    const focusedOverlay = await page.evaluate(() => {
      // The focused row's overlay, its fade finished at once (the value it is heading to).
      const overlay = document.activeElement!.closest('[data-testid="track-row"]')!.querySelector<HTMLElement>('[data-testid="track-cover-overlay"]')!
      for (const animation of overlay.getAnimations()) animation.finish()
      return getComputedStyle(overlay).opacity
    })
    expect(focusedOverlay).toBe('1')

    // --- Track editor: three visibility cards of one width, on one line ---
    await page.goto(`/tracks/${ids[TRACKS[0]!]}/edit`)
    const cards = page.getByRole('radiogroup').getByRole('radio')
    await expect(cards).toHaveCount(3)
    // The cards' boxes (the radio's label card is its parent).
    const boxes = await cards.evaluateAll(list => list.map((radio) => {
      const box = radio.closest('[data-slot="item"]')!.getBoundingClientRect()
      return { y: box.y, width: Math.round(box.width) }
    }))
    expect(new Set(boxes.map(b => b.y)).size).toBe(1)
    expect(new Set(boxes.map(b => b.width)).size).toBe(1)
    // Rows with no empty part: album, year and genre on one, genre ending where the title does.
    /** A form field's box: the nearest root around its label (the tabs' root holds them all). */
    const field = (label: string) => page.locator('form label', { hasText: new RegExp(`^${label}`) })
      .locator('xpath=ancestor::*[@data-slot="root"][1]').evaluate((element) => {
        const box = element.getBoundingClientRect()
        return { y: box.y, right: Math.round(box.right) }
      })
    const [title, album, year, genre] = await Promise.all(['Title', 'Album', 'Year', 'Genre'].map(field))
    expect(year!.y).toBe(album!.y)
    expect(genre!.y).toBe(album!.y)
    expect(genre!.right).toBe(title!.right)
    // And as tall: no help line under the genre (the menu's search box has the hint).
    const heights = await Promise.all(['Album', 'Genre'].map(label => page.locator('form label', { hasText: new RegExp(`^${label}`) })
      .locator('xpath=ancestor::*[@data-slot="root"][1]').evaluate(element => Math.round(element.getBoundingClientRect().height))))
    expect(heights[1]).toBe(heights[0])
    await page.getByRole('button', { name: 'Genre', exact: true }).click()
    await expect(page.getByPlaceholder('Search or type a new genre…')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByPlaceholder('Search or type a new genre…')).toBeHidden()
    // Mastering and version in the left column, under the cover, before the file's data (as
    // switches on a row of the form they left it looking empty).
    const status = (await page.getByTestId('track-status').boundingBox())!
    // The cover's button (the track has the Chronovault artwork, with no alt text).
    const coverBox = (await page.getByRole('button', { name: 'Add cover' }).boundingBox())!
    const fileData = (await page.getByText('Duration', { exact: true }).boundingBox())!
    expect(Math.round(status.x)).toBe(Math.round(coverBox.x))
    expect(Math.round(status.x)).toBe(Math.round(fileData.x))
    expect(status.y).toBeGreaterThan(coverBox.y + coverBox.height)
    expect(status.y + status.height).toBeLessThan(fileData.y)
    // Save: grey with nothing to save, gold after an edit, grey again once the edit is undone.
    const saveTrack = page.getByTestId('save-track')
    expect(await isPrimary(saveTrack)).toBe(false)
    await page.getByTestId('field-title').fill(`${TRACKS[0]}!`)
    await expect.poll(() => isPrimary(saveTrack)).toBe(true)
    await page.getByTestId('field-title').fill(TRACKS[0]!)
    await expect.poll(() => isPrimary(saveTrack)).toBe(false)
    // The status switches are the form's, outside its element: an edit like any other.
    await page.getByRole('switch', { name: 'Final version' }).click()
    await expect.poll(() => isPrimary(saveTrack)).toBe(true)
    await page.getByRole('switch', { name: 'Final version' }).click()
    await expect.poll(() => isPrimary(saveTrack)).toBe(false)

    // --- Playlist page: the tracks first, the details in a dialog ---
    await page.goto(`/playlists/${playlist}`)
    const firstRow = (await page.getByTestId('playlist-track').first().boundingBox())!
    expect(firstRow.y + firstRow.height).toBeLessThanOrEqual(height / 2)
    await expect(page.getByTestId('playlist-field-title')).toHaveCount(0)
    await page.getByTestId('playlist-edit-details').click()
    const details = page.getByRole('dialog', { name: 'Edit playlist details' })
    await expect(details.getByTestId('playlist-field-title')).toHaveValue('Desk playlist')
    expect(await isPrimary(details.getByTestId('save-playlist'))).toBe(false)
    // Cancel drops what was typed: the next opening starts from the saved title.
    await details.getByTestId('playlist-field-title').fill('Not kept')
    await expect.poll(() => isPrimary(details.getByTestId('save-playlist'))).toBe(true)
    await details.getByRole('button', { name: 'Cancel' }).click()
    await expect(details).toBeHidden()
    await page.getByTestId('playlist-edit-details').click()
    await expect(details.getByTestId('playlist-field-title')).toHaveValue('Desk playlist')
    await page.keyboard.press('Escape')

    // --- Share pages: Play (and the playlist's first track) in the first screen ---
    await page.goto(`/p/${playlist}`)
    await waitForHydration(page)
    const play = (await page.getByTestId('shared-play').boundingBox())!
    expect(play.y + play.height).toBeLessThanOrEqual(height)
    const shared = (await page.getByTestId('shared-playlist-track').first().boundingBox())!
    expect(shared.y + shared.height).toBeLessThanOrEqual(height)
    // The playlist's page as the track's: the player a bar at the window's bottom, with previous /
    // next and full screen (the view shows the track playing, which this page does not); the list
    // in the top half under a compact header (a large cover started it at the bottom edge); the
    // now-playing panel ending above the bar.
    const playlistBar = page.getByTestId('shared-bar')
    const barBox = (await playlistBar.boundingBox())!
    expect(Math.round(barBox.y + barBox.height)).toBe(height)
    for (const control of ['shared-previous', 'shared-next', 'shared-expand']) await expect(playlistBar.getByTestId(control)).toBeVisible()
    expect(shared.y).toBeLessThan(height / 2)
    const nowPlaying = (await page.getByTestId('shared-now-playing').boundingBox())!
    expect(nowPlaying.y + nowPlaying.height).toBeLessThanOrEqual(barBox.y)
    await page.goto(`/t/${ids[TRACKS[0]!]}`)
    await waitForHydration(page)
    // The track's page: its player bar at the window's bottom (Play sat on the bottom edge once,
    // the row under the waveform under it).
    const trackControls = (await page.getByTestId('shared-play').boundingBox())!
    expect(trackControls.y + trackControls.height).toBeLessThanOrEqual(height)

    // --- Full-screen player without lyrics ---
    await page.goto('/')
    const expanded = page.getByTestId('player-expanded')
    // With a description: it fills the right column, beside the cover (the share page's layout).
    await rows.filter({ hasText: TRACKS[0]! }).getByTestId('track-title').click()
    await rows.filter({ hasText: TRACKS[0]! }).getByTestId('track-title').click()
    await expect(expanded).toBeVisible()
    const description = expanded.getByTestId('player-about')
    await expect(description).toContainText('Written for the desk.')
    const cover = (await expanded.locator('img').first().boundingBox())!
    expect((await description.boundingBox())!.x).toBeGreaterThan(cover.x + cover.width)
    // With neither lyrics nor a description: one column, in the middle of the screen.
    await page.keyboard.press('Escape')
    await expect(expanded).toBeHidden()
    await rows.filter({ hasText: TRACKS[1]! }).getByTestId('track-title').click()
    await rows.filter({ hasText: TRACKS[1]! }).getByTestId('track-title').click()
    await expect(expanded).toBeVisible()
    await expect(expanded.getByTestId('player-about')).toHaveCount(0)
    await expect(expanded.getByText('No lyrics')).toHaveCount(0)
    // The column of title and cover (the first section of the view).
    const column = (await expanded.locator('section').first().boundingBox())!
    expect(Math.abs(column.x + column.width / 2 - 1440 / 2)).toBeLessThan(2)

    // --- Full-screen player on smaller windows: every control of its bar on screen ---
    // (At 1280×720 the controls, in the cover's column then, once fell under the bottom edge.)
    const bar = expanded.getByTestId('player-expanded-bar')
    for (const [width, windowHeight] of [[1440, 900], [1366, 768], [1280, 720], [1024, 640]] as const) {
      await page.setViewportSize({ width, height: windowHeight })
      // The lowest button or slider of the bar, once the layout has followed the window.
      await expect.poll(() => bar.evaluate(element => Math.max(
        ...[...element.querySelectorAll('button, [role="slider"]')].map(control => control.getBoundingClientRect().bottom),
      )), { message: `controls inside a ${width}×${windowHeight} window` }).toBeLessThanOrEqual(windowHeight)
    }
  })

  test('a shared track: a centred band, the cover and About on the left, the lyrics as tall beside them, a bottom bar', async ({ page, browser }) => {
    await signUp(page)
    await uploadTrack(page, 'Desk aria')
    // Unlisted, with long lyrics and a description.
    const id = await page.evaluate(async () => {
      const [track] = await (await fetch('/api/tracks')).json() as { id: string }[]
      const lyrics = Array.from({ length: 6 }, (_, v) => `[Verse ${v + 1}]\nA line\nAnother line\nA third line\nThe last line`).join('\n\n')
      await fetch(`/api/tracks/${track!.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ visibility: 'unlisted', composers: 'Ada', album: 'Desk', year: 2026, lyrics, description: 'Written for the desk.' }),
      })
      return track!.id
    })
    // A visitor.
    const context = await browser.newContext()
    try {
      const visitor = await context.newPage()
      // Laptop and desktop windows, the 1505×738 one included (there the cover was 207px, play under the edge).
      for (const [width, height] of [[1440, 900], [1505, 738], [1920, 1080]] as const) {
        await visitor.setViewportSize({ width, height })
        await visitor.goto(`/t/${id}`)
        await waitForHydration(visitor)
        await visitor.getByTestId('shared-play').click()
        await expect(visitor.getByTestId('shared-play')).toHaveAttribute('aria-label', 'Pause')
        /** Where everything is, in the window. */
        const measure = () => visitor.evaluate(() => {
          const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect()
          return {
            track: rect('[data-testid="shared-track"]'),
            cover: document.querySelector('[data-testid="shared-track"] img')!.getBoundingClientRect(),
            // The title's band (a draft's badge and the byline in it).
            title: document.querySelector('[data-testid="shared-title"]')!.parentElement!.getBoundingClientRect(),
            heading: rect('[data-testid="shared-title"]'),
            // The byline (composers · album · year · genre): the element after the title.
            byline: document.querySelector('[data-testid="shared-title"]')!.nextElementSibling!.getBoundingClientRect(),
            about: rect('[data-testid="shared-description"]'),
            panel: rect('[data-testid="shared-lyrics"]'),
            bar: rect('[data-testid="shared-bar"]'),
            play: rect('[data-testid="shared-play"]'),
            download: rect('[data-testid="shared-download"]'),
            rem: Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
          }
        })
        const box = await measure()
        const at = `${width}×${height}`
        // The title's band over both columns, centred.
        expect(box.title.bottom, `${at}: the band over the cover`).toBeLessThan(box.cover.top)
        expect(box.title.bottom, `${at}: the band over the lyrics`).toBeLessThan(box.panel.top)
        expect(Math.abs((box.title.left + box.title.right) / 2 - (box.track.left + box.track.right) / 2), `${at}: the band centred`).toBeLessThan(1)
        // Two lines: the title, then the byline under it, centred (on the title's line it read as data).
        expect(box.byline.top, `${at}: the byline under the title`).toBeGreaterThanOrEqual(box.heading.bottom - 1)
        expect(Math.abs((box.byline.left + box.byline.right) / 2 - (box.track.left + box.track.right) / 2), `${at}: the byline centred`).toBeLessThan(1)
        // Left: a square cover as wide as the column (at least 25rem: it was held to the screen's
        // height, a thumbnail on short windows), then About.
        expect(Math.abs(box.cover.width - box.cover.height), at).toBeLessThan(1)
        expect(box.cover.width, at).toBeGreaterThanOrEqual(25 * box.rem)
        expect(box.about.top, `${at}: About under the cover`).toBeGreaterThan(box.cover.bottom)
        // Right: the lyrics panel exactly as tall as the left column, from the cover's top to About's end.
        expect(Math.abs(box.cover.top - box.panel.top), `${at}: cover and panel start together`).toBeLessThan(1)
        expect(Math.abs(box.about.bottom - box.panel.bottom), `${at}: About and panel end together`).toBeLessThan(1)
        // The player bar at the bottom of the window, as wide as the content: play under the cover's
        // left edge, Download under the panel's right edge.
        expect(Math.abs(box.bar.bottom - height), at).toBeLessThan(1)
        expect(Math.abs(box.play.left - box.cover.left), `${at}: play under the cover's edge`).toBeLessThan(1)
        expect(Math.abs(box.download.right - box.panel.right), `${at}: Download under the panel's edge`).toBeLessThan(1)
        // Scrolled to the end, About and the panel's end clear the bar.
        await visitor.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
        await expect.poll(async () => (await measure()).panel.bottom, { message: `${at}: the end above the bar` }).toBeLessThanOrEqual(box.bar.top)
      }
      // No cover of its own: the Chronovault artwork it shows opens full screen all the same
      // (it opened nothing at first, and a click on it seemed broken).
      await visitor.getByRole('button', { name: 'Open the cover full screen' }).click()
      await expect(visitor.getByTestId('cover-viewer').locator('img')).toHaveAttribute('src', /cover-fallback/)
      await visitor.keyboard.press('Escape')
      await expect(visitor.getByTestId('cover-viewer')).toBeHidden()
    }
    finally {
      await context.close()
    }
  })
})
