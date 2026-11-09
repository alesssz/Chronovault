/**
 * Playwright's `test` and `expect`, with two checks every spec gets. A test
 * fails when:
 * - the browser blocked something under the Content Security Policy. A
 *   missing origin in the policy does not throw anywhere in the app's code
 *   (the audio just never plays, the upload hangs);
 * - a server-rendered page did not hydrate as rendered ("Hydration completed
 *   but contains mismatches", logged by Vue in production builds too): the
 *   browser's first pass differed from the server's HTML, so Vue redid that
 *   part of the page (a layout chosen by window width, for one: see
 *   useMountedMediaQuery).
 * Neither shows anywhere a test would look, so the whole suite doubles as
 * their check. Specs import from here, not '@playwright/test'.
 *
 * Watched: the test's own context and every context the test opens with
 * `browser.newContext()`, which is how specs play an anonymous visitor on
 * the share pages (/t, /p), the pages strangers actually open.
 */
import { expect, test as base, type BrowserContext } from '@playwright/test'

// Everything else (expect, types…) as Playwright exports it; `test` below takes the place of its own.
export * from '@playwright/test'

export const test = base.extend<{ browserErrors: { csp: string[], hydration: string[] } }>({
  // Collected from every page of every watched context (popups and second tabs included).
  browserErrors: [async ({ context, browser }, use) => {
    // Chromium's console report of each blocked load or script, and Vue's of each page that hydrated with mismatches.
    const errors = { csp: [] as string[], hydration: [] as string[] }
    /** Records the context's CSP reports and hydration mismatches, with the page they came from. */
    const watch = (watched: BrowserContext) => {
      watched.on('console', (message) => {
        if (message.type() !== 'error') return
        const text = message.text()
        if (text.includes('Content Security Policy')) errors.csp.push(text)
        if (text.includes('Hydration completed but contains mismatches')) errors.hydration.push(`${text} (${new URL(message.page()?.url() ?? 'about:blank').pathname})`)
      })
    }
    watch(context)
    // Contexts the test opens (visitors) are watched too, for the length of the test.
    const newContext = browser.newContext.bind(browser)
    browser.newContext = async (...args) => {
      // The visitor's context, as Playwright makes it.
      const opened = await newContext(...args)
      watch(opened)
      return opened
    }
    try {
      await use(errors)
    }
    finally {
      // The browser is shared by the worker's tests: give it its own method back.
      browser.newContext = newContext
    }
    expect(errors.csp, 'blocked by the Content Security Policy').toEqual([])
    expect(errors.hydration, 'pages that did not hydrate as the server rendered them').toEqual([])
  }, { auto: true }],
})
