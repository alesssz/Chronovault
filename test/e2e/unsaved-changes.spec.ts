/**
 * End-to-end, unsaved changes survive an accidental reload or close: the track editor (and every
 * form built on useEditForm) makes the browser ask before the page goes away while there are
 * unsaved edits (beforeunload), and lets it go quietly once they are saved, or when nothing changed.
 * Leaving for another page of the app asks too, through the router (useEditForm).
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
})
