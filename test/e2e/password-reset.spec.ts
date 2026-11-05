/**
 * End-to-end: "Forgot password?" sends an email whose link, opened in another
 * browser, lets the user choose a new password; the old one stops working,
 * the link works once, and a broken link offers a new one.
 * The email is read from the local Auth's mail catcher (Mailpit).
 */
import type { APIRequestContext } from '@playwright/test'
import { expect, test } from './fixtures'
import { signIn, signUp } from './helpers'

/** Mailpit's API: the `[inbucket]` port in supabase/config.toml. */
const MAILPIT = 'http://127.0.0.1:54324/api/v1'

/** The link of the reset email last sent to `email`, once it has arrived. */
async function resetLink(request: APIRequestContext, email: string): Promise<string> {
  // The newest message to that address, polled until Auth has sent it.
  let id = ''
  await expect.poll(async () => {
    const search = await request.get(`${MAILPIT}/search`, { params: { query: `to:"${email}"` } })
    id = (await search.json()).messages?.[0]?.ID ?? ''
    return id
  }, { message: 'the reset email reaches Mailpit' }).not.toBe('')
  const message = await (await request.get(`${MAILPIT}/message/${id}`)).json()
  expect(message.Subject).toBe('Reset your Chronovault password')
  // The template's link (supabase/templates/recovery.html), its `&amp;` back to `&`.
  const href = /href="([^"]*token_hash=[^"]*)"/.exec(message.HTML)?.[1]
  expect(href, 'a link with a token in the email').toBeTruthy()
  return href!.replaceAll('&amp;', '&')
}

test.describe('password reset', () => {
  test('a forgotten password is replaced through the emailed link, opened in another browser', async ({ page, browser, request }) => {
    const email = await signUp(page)
    await page.getByRole('button', { name: 'User menu' }).click()
    await page.getByRole('menuitem', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/login/)

    await page.getByRole('button', { name: 'Forgot password?' }).click()
    await expect(page.getByText('Reset your password')).toBeVisible()
    await page.getByRole('textbox', { name: 'Email' }).fill(email)
    await page.getByRole('button', { name: 'Send link' }).click()
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()
    await expect(page.getByText(`If an account exists for ${email}`)).toBeVisible()

    const link = await resetLink(request, email)
    expect(link).toMatch(/\/reset-password\?token_hash=.+&type=recovery$/)

    // Another browser: no cookies, nothing left by the request above (a phone opening the email).
    const other = await browser.newContext()
    const phone = await other.newPage()
    await phone.goto(link)
    await expect(phone.getByText('Choose a new password')).toBeVisible()
    // The used token leaves the address bar: a reload does not try it again.
    await expect(phone).toHaveURL(/\/reset-password$/)
    await phone.locator('input[name="password"]').fill('password-new-456')
    await phone.getByRole('button', { name: 'Save password' }).click()
    await expect(phone.getByRole('heading', { name: 'Your library', exact: true })).toBeVisible()
    await other.close()

    // The link works once.
    const third = await browser.newContext()
    const again = await third.newPage()
    await again.goto(link)
    await expect(again.getByRole('heading', { name: 'This link no longer works' })).toBeVisible()
    await third.close()

    // Back in the first browser: the old password is refused, the new one signs in.
    await page.getByRole('button', { name: 'Back to sign in' }).click()
    await page.getByRole('textbox', { name: 'Email' }).fill(email)
    await page.locator('input[name="password"]').fill('password-e2e-123')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByText('Sign-in failed').first()).toBeVisible()
    await signIn(page, email, 'password-new-456')
  })

  test('a broken link offers a new one', async ({ page }) => {
    await page.goto('/reset-password?token_hash=not-a-token&type=recovery')
    await expect(page.getByRole('heading', { name: 'This link no longer works' })).toBeVisible()
    await page.getByRole('link', { name: 'Get a new link' }).click()
    await expect(page).toHaveURL(/\/login\?forgot/)
    await expect(page.getByText('Reset your password')).toBeVisible()
  })
})
