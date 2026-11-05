/**
 * End-to-end, layout on a 1440×900 desktop, measured on the pages (the touch layouts are
 * responsive.spec.ts). Regressions found by a review of the interface:
 * - the library rows' genre and icons stand in columns (a genre badge as wide as its name moved
 *   the icons from row to row);
 * - the visibility cards are three equal columns (as a row of cards as wide as their text,
 *   Public sat alone on a second line);
 * - a playlist's page starts with its tracks, its details in a dialog (the form came first and
 *   pushed the tracks below the bottom edge);
 * - the share pages of a playlist and of a track keep Play, and the playlist its first track, in
 *   the first screen (a 26rem cover put them on or below the bottom edge);
 * - the full-screen player of a track without lyrics shows its description beside the controls,
 *   and with neither a single centred column (half the screen held only "No lyrics").
 */
import { expect, test, type Page } from './fixtures'
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

    // --- Playlist page: the tracks first, the details in a dialog ---
    await page.goto(`/playlists/${playlist}`)
    const firstRow = (await page.getByTestId('playlist-track').first().boundingBox())!
    expect(firstRow.y + firstRow.height).toBeLessThanOrEqual(height / 2)
    await expect(page.getByTestId('playlist-field-title')).toHaveCount(0)
    await page.getByTestId('playlist-edit-details').click()
    const details = page.getByRole('dialog', { name: 'Edit playlist details' })
    await expect(details.getByTestId('playlist-field-title')).toHaveValue('Desk playlist')
    // Cancel drops what was typed: the next opening starts from the saved title.
    await details.getByTestId('playlist-field-title').fill('Not kept')
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
    await page.goto(`/t/${ids[TRACKS[0]!]}`)
    await waitForHydration(page)
    // The track's page: the row under the waveform too (full screen, volume), where Play sat
    // on the bottom edge and that row under it.
    const trackControls = (await page.getByTestId('shared-expand').boundingBox())!
    expect(trackControls.y + trackControls.height).toBeLessThanOrEqual(height)

    // --- Full-screen player without lyrics ---
    await page.goto('/')
    const expanded = page.getByTestId('player-expanded')
    // With a description: it fills the right column.
    await rows.filter({ hasText: TRACKS[0]! }).getByTestId('track-title').click()
    await rows.filter({ hasText: TRACKS[0]! }).getByTestId('track-title').click()
    await expect(expanded).toBeVisible()
    const description = expanded.getByTestId('player-description')
    await expect(description).toContainText('Written for the desk.')
    expect((await description.boundingBox())!.x).toBeGreaterThan(1440 / 2)
    // With neither lyrics nor a description: one column, in the middle of the screen.
    await page.keyboard.press('Escape')
    await expect(expanded).toBeHidden()
    await rows.filter({ hasText: TRACKS[1]! }).getByTestId('track-title').click()
    await rows.filter({ hasText: TRACKS[1]! }).getByTestId('track-title').click()
    await expect(expanded).toBeVisible()
    await expect(expanded.getByTestId('player-description')).toHaveCount(0)
    await expect(expanded.getByText('No lyrics')).toHaveCount(0)
    // The column of cover and controls (the first section of the view).
    const column = (await expanded.locator('section').first().boundingBox())!
    expect(Math.abs(column.x + column.width / 2 - 1440 / 2)).toBeLessThan(2)
  })
})
