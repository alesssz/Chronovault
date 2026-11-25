/**
 * requireAuth (server/utils/auth.ts): a verified session gives its user; no session, a token
 * that cannot be verified or a refresh Auth refused are a 401 that reveals nothing; only Auth
 * being unreachable is a 503.
 */
import { AuthInvalidJwtError, AuthRetryableFetchError, AuthSessionMissingError, type AuthError } from '@supabase/supabase-js'
import type { H3Event } from 'h3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { requireAuth } from '~~/server/utils/auth'

/** What the mocked client's getClaims() answers next. */
let claimsResult: { data: { claims: { sub: string } } | null, error: AuthError | null }

vi.mock('#supabase/server', () => ({
  serverSupabaseClient: async () => ({ auth: { getClaims: async () => claimsResult } }),
}))

const event = {} as H3Event

/** The error requireAuth throws (it must throw). */
async function failure(): Promise<{ statusCode: number, message: string }> {
  return requireAuth(event).then(() => expect.fail('requireAuth resolved'), error => error)
}

describe('requireAuth', () => {
  afterEach(() => vi.restoreAllMocks())

  it('gives the user of a verified session', async () => {
    claimsResult = { data: { claims: { sub: 'user-1' } }, error: null }
    expect((await requireAuth(event)).userId).toBe('user-1')
  })

  it('answers 401 without a session', async () => {
    claimsResult = { data: null, error: new AuthSessionMissingError() }
    expect(await failure()).toMatchObject({ statusCode: 401, message: 'Sign-in required' })
  })

  it('answers 401, not 500, for a token that cannot be verified, without its message', async () => {
    claimsResult = { data: null, error: new AuthInvalidJwtError('Invalid JWT structure') }
    const error = await failure()
    expect(error).toMatchObject({ statusCode: 401, message: 'Sign-in required' })
    expect(JSON.stringify(error)).not.toContain('JWT')
  })

  it('answers 503 when Auth cannot be reached, logged on the server', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    claimsResult = { data: null, error: new AuthRetryableFetchError('fetch failed', 0) }
    expect(await failure()).toMatchObject({ statusCode: 503, message: 'Sign-in could not be checked' })
    expect(log).toHaveBeenCalledWith('[auth.claims]', claimsResult.error)
  })
})
