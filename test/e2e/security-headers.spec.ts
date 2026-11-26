/**
 * End-to-end, security headers: every response carries the fixed ones
 * (routeRules in nuxt.config.ts), and every HTML page a Content Security
 * Policy whose nonce is fresh for each response and written into each of
 * the page's scripts (server/plugins/content-security-policy.ts), and
 * nowhere else: user text that looks like a script stays text. That
 * nothing the app needs is blocked is checked by every spec (fixtures.ts),
 * a share page's cover by its own test here.
 */
import { expect, test } from './fixtures'
import { clickAndWaitForApi, seedLibrary, signUp, TINY_PNG, uniqueId, uploadTrack, waitForHydration } from './helpers'

// The edit page saves with PATCH /api/tracks/:id (the cover and the other fields alike).
const SAVE_TRACK = { method: 'PATCH', path: /^\/api\/tracks\/[0-9a-f-]+$/ }

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
    const [first, second] = await Promise.all([request.get('/login'), request.get('/login')])
    expect(nonceOf(first.headers()['content-security-policy'])).not.toBe(nonceOf(second.headers()['content-security-policy']))
  })

  test('only /cast-test lets scripts come from the Cast SDK\'s host', async ({ page }) => {
    // Signed in: /cast-test sends anyone else to /login, whose policy a plain request would read.
    await signUp(page)
    for (const path of ['/', '/login', '/t/00000000-0000-4000-8000-000000000000']) {
      const policy = (await page.request.get(path, { failOnStatusCode: false })).headers()['content-security-policy']
      expect(policy, `${path}: a policy`).toBeTruthy()
      expect(policy, path).not.toContain('gstatic.com')
    }
    const castTest = await page.request.get('/cast-test', { maxRedirects: 0 })
    expect(castTest.status()).toBe(200)
    expect(castTest.headers()['content-security-policy']).toMatch(/script-src [^;]*https:\/\/www\.gstatic\.com/)
  })

  test('API answers and static files carry the fixed headers, without a policy of their own', async ({ request }) => {
    for (const path of ['/api/health', '/favicon.svg']) {
      const headers = (await request.get(path)).headers()
      expect(headers, path).toMatchObject(FIXED_HEADERS)
      expect(headers['content-security-policy'], path).toBeUndefined()
    }
  })
})

test.describe('the policy on the share pages', () => {
  // The dev server sends no policy: its hot reload injects scripts of its own.
  test.skip(process.env.E2E_DEV === '1', 'the Content Security Policy is sent by production builds only')

  test('a title that looks like a script stays text, in the page and in its link preview', async ({ page, browser }) => {
    await signUp(page)
    await seedLibrary(page, 1)
    // A title that closes the preview tag's value if a nonce is written into it, then runs a script.
    const title = 'x<script a><script>window.__xss = 1</script>'
    // The track, renamed and shared through the API; its id.
    const id = await page.evaluate(async (title) => {
      const [track] = await (await fetch('/api/tracks')).json() as { id: string }[]
      const response = await fetch(`/api/tracks/${track!.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title, visibility: 'unlisted' }),
      })
      if (!response.ok) throw new Error(`Track not saved: ${response.status}`)
      return track!.id
    }, title)

    const visitorContext = await browser.newContext()
    try {
      // A visitor opening the share link: the page is rendered by the server, link preview included.
      const visitor = await visitorContext.newPage()
      await visitor.goto(`/t/${id}`)
      await waitForHydration(visitor)
      // A nonce written into the preview's `content` would let the script in the title run.
      expect(await visitor.evaluate(() => (window as { __xss?: number }).__xss)).toBeUndefined()
      await expect(visitor.locator('meta[property="og:title"]')).toHaveAttribute('content', title)
      await expect(visitor.getByTestId('shared-title')).toHaveText(title)
    }
    finally {
      await visitorContext.close()
    }
  })

  test('a shared track shows its cover', async ({ page, browser }) => {
    await signUp(page)
    const title = `cover-${uniqueId()}`
    await uploadTrack(page, title)
    await page.getByRole('link', { name: 'Go to library' }).click()
    const row = page.getByTestId('track-row').filter({ hasText: title })
    await row.getByRole('button', { name: `Actions for ${title}` }).click()
    await page.getByRole('menuitem', { name: 'Edit' }).click()

    // A cover (kept as the crop editor centres it), then the track shared.
    await page.getByTestId('cover-input').setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: TINY_PNG })
    await clickAndWaitForApi(page, page.getByTestId('crop-confirm'), SAVE_TRACK)
    await page.getByText('Unlisted', { exact: true }).click()
    await clickAndWaitForApi(page, page.getByTestId('save-track'), SAVE_TRACK)
    // The track's id, from the edit page's address (/tracks/:id/edit).
    const id = new URL(page.url()).pathname.split('/')[2]

    const visitorContext = await browser.newContext()
    try {
      const visitor = await visitorContext.newPage()
      await visitor.goto(`/t/${id}`)
      // The cover (the page's and, once hydrated, the player's), at a signed Supabase Storage URL:
      // another origin, which img-src must allow.
      const covers = visitor.getByRole('img', { name: `Cover of ${title}` })
      await expect(covers.first()).toHaveAttribute('src', /\/storage\/v1\/object\/sign\/covers\//)
      // Each one really loaded (a blocked image has no size); a blocked load also fails the test (fixtures.ts).
      await expect.poll(() => covers.evaluateAll((imgs: HTMLImageElement[]) => imgs.every(img => img.complete && img.naturalWidth > 0))).toBe(true)
    }
    finally {
      await visitorContext.close()
    }
  })
})
