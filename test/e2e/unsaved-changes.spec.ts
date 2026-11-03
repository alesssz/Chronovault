/**
 * End-to-end, unsaved changes survive an accidental reload or close: the track editor (and every
 * form built on useEditForm) makes the browser ask before the page goes away while there are
 * unsaved edits (beforeunload), and lets it go quietly once they are saved, or when nothing changed.
 * Leaving for another page of the app asks too, through the router (useEditForm). A line stamped
 * in the Sync tab while a save is on its way (the form's fields are disabled then, the editor's
 * keys are not) survives the save's answer, and stays unsaved until saved in turn.
 */
import { expect, test, type Page } from './fixtures'
import { signUp, uploadTrack } from './helpers'

/** Opens the edit page of the only track in the library. */
async function openEditor(page: Page, title: string) {
  await page.getByRole('link', { name: 'Go to library' }).click()
  // The library row of the track.
  const row = page.getByTestId('track-row').filter({ hasText: title })
  await row.getByRole('button', { name: `Actions for ${title}` }).click()
  await page.getByRole('menuitem', { name: 'Edit' }).click()
  await expect(page).toHaveURL(/\/tracks\/.+\/edit/)
}

/**
 * Closes the page the way a closed tab does (beforeunload runs) and says whether the browser
 * asked first. The question is answered "stay" (dismissed), as a user unsure would.
 */
async function browserAsksBeforeClosing(page: Page): Promise<boolean> {
  // Whether the beforeunload question was shown.
  let asked = false
  page.on('dialog', async (dialog) => {
    if (dialog.type() === 'beforeunload') asked = true
    await dialog.dismiss()
  })
  await page.close({ runBeforeUnload: true })
  // The question (if any) comes before the page goes away: give it a moment to arrive.
  await expect.poll(() => asked, { timeout: 2_000 }).toBe(true).catch(() => {})
  return asked
}

test.describe('unsaved changes', () => {
  test('the browser asks before closing the editor with unsaved edits', async ({ page }) => {
    await signUp(page)
    await uploadTrack(page, 'Unsaved')
    await openEditor(page, 'Unsaved')
    // An edit, not saved (typing also gives the page the user activation the browser requires).
    await page.getByTestId('field-title').fill('Unsaved, edited')
    await expect(page.getByTestId('save-track')).toBeEnabled()

    expect(await browserAsksBeforeClosing(page)).toBe(true)
  })

  test('nothing is asked once the edits are saved', async ({ page }) => {
    await signUp(page)
    await uploadTrack(page, 'Saved')
    await openEditor(page, 'Saved')
    await page.getByTestId('field-title').fill('Saved, edited')
    await page.getByTestId('save-track').click()
    await expect(page.getByText('Changes saved').first()).toBeVisible()

    expect(await browserAsksBeforeClosing(page)).toBe(false)
  })

  test('a line stamped while a save is on its way is kept, and still unsaved', async ({ page }) => {
    await signUp(page)
    // Long enough to keep playing for the whole test.
    await uploadTrack(page, 'Racing', { seconds: 60 })
    // Three lines of lyrics to sync, set through the API.
    await page.evaluate(async () => {
      // The only track of the library.
      const [track] = await (await fetch('/api/tracks')).json() as { id: string }[]
      await fetch(`/api/tracks/${track!.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lyrics: 'First line\nSecond line\nThird line' }),
      })
    })
    // The track playing (lines are stamped at the player's position), then its editor's Sync tab.
    await page.getByRole('link', { name: 'Go to library' }).click()
    // The library row of the track.
    const row = page.getByTestId('track-row').filter({ hasText: 'Racing' })
    await row.getByTestId('track-title').click()
    await row.getByRole('button', { name: 'Actions for Racing' }).click()
    await page.getByRole('menuitem', { name: 'Edit' }).click()
    await page.getByRole('tab', { name: 'Sync' }).click()
    // The sync editor's counter of stamped lines.
    const counter = page.getByText(/\d \/ 3 lines synced/)
    // Space stamps from the page, not from the tab just clicked (a focused button keeps Space).
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    await page.keyboard.press('Space')
    await expect(counter).toHaveText('1 / 3 lines synced')

    // The save's answer is held until the test lets it go, as on a slow network.
    let release!: () => void
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route(/\/api\/tracks\/[0-9a-f-]+$/, async (route) => {
      if (route.request().method() === 'PATCH') await held
      await route.continue()
    })
    // Saved with one line stamped; while the request is out, the next line is stamped (the form's
    // fields are disabled during a save, but the editor's keys are not). Space goes to the page,
    // not to the Save button just clicked.
    const sent = page.waitForRequest(request => request.method() === 'PATCH')
    await page.getByTestId('save-track').click()
    await sent
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    await page.keyboard.press('Space')
    await expect(counter).toHaveText('2 / 3 lines synced')
    release()
    await expect(page.getByText('Changes saved').first()).toBeVisible()

    // Before: the server's copy (one line) replaced the form and marked it clean: the second line
    // was dropped without a word, Save off, no warning on leaving. Now it is still to save…
    await expect(page.getByTestId('save-track')).toBeEnabled()
    await page.unroute(/\/api\/tracks\/[0-9a-f-]+$/)
    // The save's answer, waited for: the button is disabled while saving too, so its state alone
    // could let the server be read before the second line is written.
    const saving = page.waitForResponse(response => response.request().method() === 'PATCH')
    await page.getByTestId('save-track').click()
    expect((await saving).ok()).toBe(true)
    await expect(page.getByTestId('save-track')).toBeDisabled()
    // …and, saved, the server has both lines.
    const saved = await page.evaluate(async (id) => {
      // The track as the server keeps it.
      const track = await (await fetch(`/api/tracks/${id}`)).json() as { lyricsSynced: { text: string }[] | null }
      return track.lyricsSynced?.map(line => line.text)
    }, new URL(page.url()).pathname.split('/')[2])
    expect(saved).toEqual(['First line', 'Second line'])
  })
})
