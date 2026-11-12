/**
 * End-to-end, the user's own subgenres (FEAT-2): a typo made in the editor or by an import can
 * be fixed, and a subgenre no longer needed removed, from "Your subgenres" at the top of the
 * import page's genre reference. A rename shows on the track at once (the library's row reads
 * the new name, from the same cached list); a name the genre already has is refused with the
 * reason and the field stays open; a deletion leaves the track with its genre only. The API
 * refuses a built-in subgenre (403) and a clashing or incoherent name (409).
 */
import { expect, test } from './fixtures'
import { signUp, uploadTrack } from './helpers'

test.describe('own subgenres', () => {
  test('rename one (its track follows), a clash refused, then delete it (the track keeps its genre)', async ({ page }) => {
    await signUp(page)
    await uploadTrack(page, 'Swamp song')

    // Through the API, as the editor does: a subgenre with a typo under Metal, set on the track.
    const { trackId, metalId, ownId, thrashId } = await page.evaluate(async () => {
      // The track just uploaded (the only one), and the genres with their subgenres.
      const [track] = await (await fetch('/api/tracks')).json() as { id: string }[]
      const genres = await (await fetch('/api/genres')).json() as { id: string, name: string, subgenres: { id: string, name: string }[] }[]
      const metal = genres.find(g => g.name === 'Metal')!
      // The user's own subgenre, misspelt.
      const own = await (await fetch(`/api/genres/${metal.id}/subgenres`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Swmap Metal' }),
      })).json() as { id: string }
      await fetch(`/api/tracks/${track!.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ genreId: metal.id, subgenreId: own.id }),
      })
      return {
        trackId: track!.id,
        metalId: metal.id,
        ownId: own.id,
        thrashId: metal.subgenres.find(s => s.name === 'Thrash Metal')!.id,
      }
    })

    // --- The API: a built-in subgenre is everyone's (403); a clashing name is refused (409) ---
    const builtin = await page.request.patch(`/api/subgenres/${thrashId}`, { data: { name: 'Trash Metal' } })
    expect(builtin.status()).toBe(403)
    expect((await page.request.delete(`/api/subgenres/${thrashId}`)).status()).toBe(403)
    const incoherent = await page.request.patch(`/api/subgenres/${ownId}`, { data: { name: 'K-Pop' } })
    expect(incoherent.status()).toBe(409)
    expect((await incoherent.json() as { message: string }).message).toBe('K-Pop belongs to Pop')

    // --- The import page: the user's own subgenre, with its genre, first in the reference ---
    await page.goto('/tracks/import')
    await page.getByRole('button', { name: 'Genres and subgenres' }).click()
    const own = page.getByTestId('own-subgenre')
    await expect(own).toHaveCount(1)
    await expect(own.getByTestId('own-subgenre-label')).toHaveText('Metal › Swmap Metal')

    // A name Metal already has: refused with the reason, the field still open to fix it.
    await own.getByRole('button', { name: 'Rename Swmap Metal' }).click()
    const field = own.getByRole('textbox', { name: 'New name for Swmap Metal' })
    await expect(field).toHaveValue('Swmap Metal')
    await field.fill('Thrash Metal')
    await own.getByTestId('own-subgenre-save').click()
    await expect(page.getByText('Metal already has Thrash Metal').first()).toBeVisible()
    await expect(field).toBeVisible()

    // The spelling fixed (Enter saves): the row shows it, and so does the track.
    await field.fill('Swamp Metal')
    await field.press('Enter')
    await expect(own.getByTestId('own-subgenre-label')).toHaveText('Metal › Swamp Metal')
    // The library's row, from the same cached list: no reload needed.
    await page.getByRole('link', { name: 'Library' }).first().click()
    await expect(page.getByTestId('track-genre')).toHaveText('Swamp Metal')

    // --- Delete it: the dialog says what happens to its tracks ---
    await page.goto('/tracks/import')
    await page.getByRole('button', { name: 'Genres and subgenres' }).click()
    await own.getByRole('button', { name: 'Delete Swamp Metal' }).click()
    const dialog = page.getByRole('dialog', { name: 'Delete Swamp Metal?' })
    await expect(dialog).toContainText('Tracks with it keep Metal, without a subgenre.')
    await dialog.getByRole('button', { name: 'Delete' }).click()
    await expect(dialog).toBeHidden()
    // No own subgenre left: the list is gone.
    await expect(page.getByTestId('own-subgenres')).toHaveCount(0)

    // The track keeps its genre, without a subgenre, on the server and in the library.
    const track = await page.evaluate(async id => (await (await fetch(`/api/tracks/${id}`)).json()) as { genreId: string, subgenreId: string | null }, trackId)
    expect(track).toMatchObject({ genreId: metalId, subgenreId: null })
    await page.goto('/')
    await expect(page.getByTestId('track-genre')).toHaveText('Metal')
    // Gone for good: a second deletion finds nothing.
    expect((await page.request.delete(`/api/subgenres/${ownId}`)).status()).toBe(404)
  })
})
