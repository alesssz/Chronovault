/**
 * End-to-end: redirects without a session, demo sign-in, wrong credentials, sign-up and sign-out.
 */
import { expect, test } from './fixtures'
import { signIn, signUp } from './helpers'

test.describe('authentication', () => {
  test('without a session the library redirects to sign-in', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByText('Welcome back')).toBeVisible()
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
})
