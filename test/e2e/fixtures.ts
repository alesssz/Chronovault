/**
 * Playwright's `test` and `expect`, with one addition every spec gets: a
 * test fails when the browser blocked something under the Content Security
 * Policy. A missing origin in the policy does not throw anywhere in the
 * app's code (the audio just never plays, the upload hangs), so the whole
 * suite doubles as its check. Specs import from here, not '@playwright/test'.
 */
import { expect, test as base } from '@playwright/test'

// Everything else (expect, types…) as Playwright exports it; `test` below takes the place of its own.
export * from '@playwright/test'

export const test = base.extend<{ cspViolations: string[] }>({
  // Collected from every page of the test's context (popups and second tabs included).
  cspViolations: [async ({ context }, use) => {
    // Chromium's console report of each blocked load or script.
    const violations: string[] = []
    context.on('console', (message) => {
      if (message.type() === 'error' && message.text().includes('Content Security Policy')) violations.push(message.text())
    })
    await use(violations)
    expect(violations, 'blocked by the Content Security Policy').toEqual([])
  }, { auto: true }],
})
