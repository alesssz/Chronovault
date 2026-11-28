/**
 * End-to-end: redirects without a session, demo sign-in, wrong credentials, sign-up and sign-out,
 * and a sign-in Supabase refused coming back to /confirm.
 */
import { expect, test } from './fixtures'
import { signIn, signUp } from './helpers'

test.describe('authentication', () => {
  test('without a session the library redirects to sign-in', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByText('Welcome back')).toBeVisible()
    // The e2e server has no Google provider: the plain form only.
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toHaveCount(0)
  })

  test('signs in with the seeded demo user', async ({ page }) => {
    await signIn(page, 'demo@chronovault.local', 'chronovault')
  })

  test('wrong credentials show an error', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('textbox', { name: 'Email' }).fill('demo@chronovault.local')
    await page.locator('input[name="password"]').fill('wrong-password')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByText('Sign-in failed').first()).toBeVisible()
    await expect(page).toHaveURL(/\/login/)
  })

  test('sign-up, sign-out and protected pages', async ({ page }) => {
    await signUp(page)

    await page.getByRole('button', { name: 'User menu' }).click()
    // With a mouse the menu offers the keyboard shortcuts (touch screens do not: responsive.spec).
    await expect(page.getByRole('menuitem', { name: 'Keyboard shortcuts' })).toBeVisible()
    await page.getByRole('menuitem', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/login/)

    await page.goto('/tracks/new')
    await expect(page).toHaveURL(/\/login/)
  })

  test('a refused Google sign-in says why instead of waiting on /confirm', async ({ page }) => {
    // What Supabase sends back for a Google account no user shares its email with, sign-ups closed.
    await page.goto('/confirm?error=access_denied&error_code=signup_disabled&error_description=Signups+not+allowed+for+this+instance')
    await expect(page.getByTestId('confirm-failed')).toContainText('No Chronovault account uses this email')
    await page.getByRole('link', { name: 'Back to sign in' }).click()
    await expect(page).toHaveURL(/\/login/)
  })

  test('an expired confirmation link says so', async ({ page }) => {
    await page.goto('/confirm#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired')
    await expect(page.getByTestId('confirm-failed')).toContainText('Email link is invalid or has expired')
  })
})
