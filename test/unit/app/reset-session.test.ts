/**
 * Which sessions may choose a new password (app/lib/reset-session.ts): one opened by a reset
 * link a moment ago, never one signed in with the password or opened by a link long since.
 */
import { describe, expect, it } from 'vitest'
import { isFreshLinkSession, LINK_SESSION_MAX_AGE } from '~/lib/reset-session'

const NOW = 1_800_000_000

describe('isFreshLinkSession', () => {
  it('accepts a session opened by the email link (otp) or a code link (recovery) just now', () => {
    expect(isFreshLinkSession([{ method: 'otp', timestamp: NOW - 2 }], NOW)).toBe(true)
    expect(isFreshLinkSession([{ method: 'recovery', timestamp: NOW }], NOW)).toBe(true)
  })

  it('refuses a session signed in with the password, however recent', () => {
    expect(isFreshLinkSession([{ method: 'password', timestamp: NOW }], NOW)).toBe(false)
  })

  it('refuses a link session once its time is up', () => {
    expect(isFreshLinkSession([{ method: 'otp', timestamp: NOW - LINK_SESSION_MAX_AGE }], NOW)).toBe(false)
  })

  it('refuses a session that says nothing about how it was opened, or not when', () => {
    expect(isFreshLinkSession(undefined, NOW)).toBe(false)
    expect(isFreshLinkSession([], NOW)).toBe(false)
    expect(isFreshLinkSession(['otp'], NOW)).toBe(false)
  })
})
