/**
 * End-to-end, metadata export and import: tracks uploaded without tags (their file names as
 * titles) are filled in from one file. The account menu leads to the page; the CSV download holds
 * the library's titles; a filled-in CSV, as Excel in Italian saves it (semicolons, lyrics on several
 * lines in a quoted cell), shows what it changes and what it skips before anything is saved; Apply
 * creates the new genre and saves the tracks, as the API then reads them. The JSON export then
 * holds every field, lyrics included, and imported back as it is changes nothing.
 */
import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures'
import { signUp, uploadTrack } from './helpers'

test.describe('metadata import', () => {
  test('a download, a filled-in file, a preview, the tracks saved, then the export', async ({ page }) => {
    test.setTimeout(90_000)
    await signUp(page)
    await uploadTrack(page, 'Artemisia')
    await uploadTrack(page, 'Night drive')

    // From the account menu.
    await page.goto('/')
    await page.getByRole('button', { name: 'User menu' }).click()
    await page.getByRole('menuitem', { name: 'Export & import metadata' }).click()
    await expect(page).toHaveURL(/\/tracks\/import$/)

    // --- The CSV template: the library's titles, the list's values ---
    const download = page.waitForEvent('download')
    await page.getByTestId('template-csv').click()
    const template = await download
    expect(template.suggestedFilename()).toBe('chronovault-metadata.csv')
    const templateText = await readFile((await template.path())!, 'utf8')
    expect(templateText.split('\r\n')[0]).toBe('\uFEFFtitle,composers,album,year,genre,mastered,status,visibility,description,suno_prompt,lyrics')
    expect(templateText).toContain('Artemisia,,,,,no,draft,private,,,')
    expect(templateText).toContain('Night drive,,,,,no,draft,private,,,')

    // --- A filled-in file, as Excel in Italian saves it ---
    const csv = [
      'Title;Composers;Album;Year;Genre;Lyrics;Mastered;Status;Visibility;BPM',
      'artemisia;Chronovault;History\'s Tales Vol.1;2026;Dark Baroque;"[Verse]\nTra l\'ombra e la luce\nil mio pennello";sì;final;unlisted;140',
      'Night drive;;;;Rock;;;;;',
      'Nowhere;Someone;;;;;;;;',
      'Night drive 2;;;soon;;;;;;',
    ].join('\r\n')
    await page.locator('input[type="file"]').setInputFiles({ name: 'filled.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })

    // The preview: nothing saved yet.
    const preview = page.getByTestId('import-preview')
    await expect(page.getByTestId('import-summary')).toContainText('2 tracks to update')
    await expect(page.getByTestId('import-ignored-columns')).toContainText('BPM')
    await expect(page.getByTestId('import-new-genres')).toContainText('Dark Baroque')
    await expect(page.getByTestId('import-not-found')).toContainText('Row 4, “Nowhere”: no track has this title.')
    await expect(page.getByTestId('import-invalid')).toContainText('Row 5, “Night drive 2”: year: "soon" is not a year.')
    await expect(page.getByTestId('import-skipped')).toContainText('2 rows will be skipped')
    const artemisia = preview.getByTestId('import-update').filter({ hasText: 'Artemisia' })
    await expect(artemisia).toContainText('History\'s Tales Vol.1')
    await expect(artemisia).toContainText('3 lines')
    await expect(artemisia).toContainText('unlisted')
    expect(await page.evaluate(async () => {
      const tracks = await (await fetch('/api/tracks')).json() as { title: string, album: string | null }[]
      return tracks.find(t => t.title === 'Artemisia')!.album
    })).toBeNull()

    // --- Apply ---
    await page.getByTestId('import-apply').click()
    await expect(page.getByTestId('import-result')).toContainText('2 tracks updated')
    const saved = await page.evaluate(async () => {
      const tracks = await (await fetch('/api/tracks')).json() as { id: string, title: string }[]
      const genres = await (await fetch('/api/genres')).json() as { id: string, name: string }[]
      const detail = async (title: string) => (await fetch(`/api/tracks/${tracks.find(t => t.title === title)!.id}`)).json() as Promise<Record<string, unknown>>
      const name = (id: unknown) => genres.find(g => g.id === id)?.name ?? null
      const a = await detail('Artemisia')
      const n = await detail('Night drive')
      return { a: { ...a, genre: name(a.genreId) }, n: { ...n, genre: name(n.genreId) } }
    })
    expect(saved.a).toMatchObject({
      composers: 'Chronovault',
      album: 'History\'s Tales Vol.1',
      year: 2026,
      genre: 'Dark Baroque',
      lyrics: '[Verse]\nTra l\'ombra e la luce\nil mio pennello',
      mastered: true,
      status: 'final',
      visibility: 'unlisted',
    })
    // Empty cells left the rest as it was.
    expect(saved.n).toMatchObject({ genre: 'Rock', composers: null, mastered: false, status: 'draft', visibility: 'private' })

    // --- The JSON export: every field, read back as it is, changes nothing ---
    const exported = page.waitForEvent('download')
    await page.getByTestId('template-json').click()
    const exportFile = await exported
    const json = await readFile((await exportFile.path())!, 'utf8')
    expect(JSON.parse(json)).toContainEqual(expect.objectContaining({
      title: 'Artemisia',
      genre: 'Dark Baroque',
      lyrics: '[Verse]\nTra l\'ombra e la luce\nil mio pennello',
      mastered: true,
    }))
    await page.locator('input[type="file"]').setInputFiles({ name: 'chronovault-metadata.json', mimeType: 'application/json', buffer: Buffer.from(json) })
    await expect(page.getByTestId('import-summary')).toContainText('0 tracks to update')
    await expect(page.getByTestId('import-summary')).toContainText('2 unchanged')
    await expect(page.getByTestId('import-apply')).toBeDisabled()
  })
})
