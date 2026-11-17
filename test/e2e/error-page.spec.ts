/**
 * End-to-end, the error page. A signed-in user meets it inside the app (header,
 * navigation, and the player bar with the track still playing), titled after
 * what is missing; a visitor gets the logo and a way to sign in. Nuxt's title
 * for an unknown route ends with the path, which the page leaves out.
 */
import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from './fixtures'
import { APP_TAGLINE } from '../../shared/brand'
import { signUp, uploadTrack, uniqueId, waitForHydration } from './helpers'

/** Moves inside the app, as a link would: playback survives, unlike a page load. */
async function navigateInApp(page: Page, path: string) {
  await page.evaluate((to) => {
    const root = document.querySelector('#__nuxt') as unknown as { __vue_app__: { $nuxt: { $router: { push: (to: string) => Promise<unknown> } } } }
    return root.__vue_app__.$nuxt.$router.push(to)
  }, path)
}

test.describe('error page', () => {
  test('signed in: inside the app, titled after what is missing, with the player still playing', async ({ page }) => {
    await signUp(page)
    const title = `Lost ${uniqueId()}`
    // Long enough to be still playing at the end of the test.
    await uploadTrack(page, title, { seconds: 120 })
    await page.goto('/')
    await page.getByTestId('track-row').filter({ hasText: title }).getByTestId('track-title').click()
    const bar = page.getByTestId('player-bar')
    await expect(bar.getByTestId('player-toggle').first()).toHaveAttribute('aria-label', 'Pause')

    // --- A missing playlist: the header, its section marked, and the player playing on ---
    await navigateInApp(page, `/playlists/${randomUUID()}`)
    const errorPage = page.getByTestId('error-page')
    await expect(errorPage.getByRole('heading', { name: 'Playlist not found' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Playlists' })).toBeVisible()
    await expect(bar.getByTestId('player-title')).toHaveText(title)
    await expect(bar.getByTestId('player-toggle').first()).toHaveAttribute('aria-label', 'Pause')

    await errorPage.getByRole('button', { name: 'Back to library' }).click()
    await expect(page.getByRole('heading', { name: 'Your library', exact: true })).toBeVisible()
    await expect(bar.getByTestId('player-toggle').first()).toHaveAttribute('aria-label', 'Pause')

    // --- A missing group of versions, by its own name ---
    await page.goto(`/versions/${randomUUID()}`)
    await expect(errorPage.getByRole('heading', { name: 'Group not found' })).toBeVisible()

    // --- An unknown address: a real 404, without the path in the title ---
    const response = await page.goto('/no-such-page')
    expect(response?.status()).toBe(404)
    await expect(errorPage.getByRole('heading', { name: 'Page not found', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Library' })).toBeVisible()
  })

  test('visitor: the logo and a way to sign in', async ({ browser }) => {
    const visitor = await (await browser.newContext()).newPage()
    const response = await visitor.goto('/t/no-such/page')
    expect(response?.status()).toBe(404)

    const errorPage = visitor.getByTestId('error-page')
    await expect(errorPage.getByRole('heading', { name: 'Page not found', exact: true })).toBeVisible()
    await expect(visitor.getByText(APP_TAGLINE)).toBeVisible()
    await expect(visitor.getByRole('link', { name: 'Library' })).toHaveCount(0)

    // Server-rendered: the button works once the page has hydrated.
    await waitForHydration(visitor)
    await errorPage.getByRole('button', { name: 'Sign in' }).click()
    await expect(visitor).toHaveURL(/\/login$/)
  })
})
