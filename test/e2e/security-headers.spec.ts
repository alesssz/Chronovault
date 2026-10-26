/**
 * End-to-end, security headers: every response carries the fixed ones
 * (routeRules in nuxt.config.ts), and every HTML page a Content Security
 * Policy whose nonce is fresh for each response and written into each of
 * the page's scripts (server/plugins/content-security-policy.ts). That
 * nothing the app needs is blocked is checked by every spec (fixtures.ts).
 */
import { expect, test } from './fixtures'

/** The headers every response carries, pages, API and static files alike. */
const FIXED_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'DENY',
  'strict-transport-security': 'max-age=63072000',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
}

/** The nonce a policy allows scripts with (`'nonce-…'` in script-src). */
function nonceOf(policy: string | undefined): string | undefined {
  return policy?.match(/'nonce-([^']+)'/)?.[1]
}

test.describe('security headers', () => {
  // The dev server sends no policy: its hot reload injects scripts of its own.
  test.skip(process.env.E2E_DEV === '1', 'the Content Security Policy is sent by production builds only')

  test('an app page and a share page: fixed headers, and a policy whose nonce every script carries', async ({ request }) => {
    // The app's shell (client-rendered) and a share page (server-rendered; this id shares nothing).
    for (const path of ['/login', '/t/00000000-0000-4000-8000-000000000000']) {
      // The page as the browser receives it.
      const response = await request.get(path, { failOnStatusCode: false })
      const headers = response.headers()
      expect(headers, path).toMatchObject(FIXED_HEADERS)

      // The policy's nonce, and every script tag of the page.
      const nonce = nonceOf(headers['content-security-policy'])
      expect(nonce, `${path}: a nonce in script-src`).toBeTruthy()
      const scripts = (await response.text()).match(/<script\b[^>]*>/g) ?? []
      expect(scripts.length, path).toBeGreaterThan(0)
      for (const tag of scripts) expect(tag, path).toContain(`nonce="${nonce}"`)
    }
  })

  test('each response draws a new nonce', async ({ request }) => {
    // Two loads of the same page.
    const [first, second] = await Promise.all([request.get('/login'), request.get('/login')])
    expect(nonceOf(first.headers()['content-security-policy'])).not.toBe(nonceOf(second.headers()['content-security-policy']))
  })

  test('API answers and static files carry the fixed headers, without a policy of their own', async ({ request }) => {
    for (const path of ['/api/health', '/favicon.svg']) {
      // A response that is not a page.
      const headers = (await request.get(path)).headers()
      expect(headers, path).toMatchObject(FIXED_HEADERS)
      expect(headers['content-security-policy'], path).toBeUndefined()
    }
  })
})
