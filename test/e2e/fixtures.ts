/**
 * Playwright's `test` and `expect`, with one addition every spec gets: a
 * test fails when the browser blocked something under the Content Security
 * Policy. A missing origin in the policy does not throw anywhere in the
 * app's code (the audio just never plays, the upload hangs), so the whole
 * suite doubles as its check. Specs import from here, not '@playwright/test'.
 *
 * Watched: the test's own context and every context the test opens with
 * `browser.newContext()`, which is how specs play an anonymous visitor on
 * the share pages (/t, /p), the pages strangers actually open.
 */
import { expect, test as base, type BrowserContext } from '@playwright/test'

// Everything else (expect, types…) as Playwright exports it; `test` below takes the place of its own.
export * from '@playwright/test'

export const test = base.extend<{ cspViolations: string[] }>({
  // Collected from every page of every watched context (popups and second tabs included).
  cspViolations: [async ({ context, browser }, use) => {
    // Chromium's console report of each blocked load or script.
    const violations: string[] = []
    /** Records the context's CSP reports. */
    const watch = (watched: BrowserContext) => {
      watched.on('console', (message) => {
        if (message.type() === 'error' && message.text().includes('Content Security Policy')) violations.push(message.text())
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
      await use(violations)
    }
    finally {
      // The browser is shared by the worker's tests: give it its own method back.
      browser.newContext = newContext
    }
    expect(violations, 'blocked by the Content Security Policy').toEqual([])
  }, { auto: true }],
})
