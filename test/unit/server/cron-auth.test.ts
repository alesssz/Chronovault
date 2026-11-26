/**
 * The cron secret (server/utils/cron-auth.ts): with CRON_SECRET set, only the exact
 * `Bearer <secret>` gets through; without it the cron routes stay open outside Vercel and refuse
 * everything on Vercel, where a missing variable is a mistake.
 */
import type { H3Event } from 'h3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cronAccess, requireCronSecret } from '~~/server/utils/cron-auth'

const SECRET = 'a-long-random-secret'

describe('cronAccess', () => {
  it('lets Vercel Cron\'s header through', () => {
    expect(cronAccess(`Bearer ${SECRET}`, SECRET, true)).toBe('allowed')
  })

  it.each([
    ['no header', undefined],
    ['an empty header', ''],
    ['another secret', 'Bearer another-secret'],
    ['the secret without its scheme', SECRET],
    ['a prefix of the header', `Bearer ${SECRET.slice(0, -1)}`],
    ['the header with something after it', `Bearer ${SECRET}x`],
    ['another scheme', `Basic ${SECRET}`],
  ])('refuses %s', (_, authorization) => {
    expect(cronAccess(authorization, SECRET, true)).toBe('refused')
    expect(cronAccess(authorization, SECRET, false)).toBe('refused')
  })

  it('stays open without a secret outside Vercel, and refuses everything on Vercel', () => {
    for (const secret of [undefined, '']) {
      expect(cronAccess(undefined, secret, false)).toBe('allowed')
      expect(cronAccess(undefined, secret, true)).toBe('unconfigured')
      // "Bearer " with an empty secret must not match an unset one.
      expect(cronAccess('Bearer ', secret, true)).toBe('unconfigured')
    }
  })
})

describe('requireCronSecret', () => {
  afterEach(() => vi.unstubAllEnvs())

  /** A request carrying this Authorization header (h3 reads it from `event.node.req.headers`). */
  function request(authorization?: string): H3Event {
    const headers = authorization === undefined ? {} : { authorization }
    return { node: { req: { headers } } } as unknown as H3Event
  }

  it('reads the secret and the header of the request', () => {
    vi.stubEnv('CRON_SECRET', SECRET)
    expect(() => requireCronSecret(request(`Bearer ${SECRET}`))).not.toThrow()
    expect(() => requireCronSecret(request())).toThrow(expect.objectContaining({ statusCode: 401 }))
  })

  it('answers 500 on Vercel without a secret, naming nothing in the response', () => {
    vi.stubEnv('CRON_SECRET', '')
    vi.stubEnv('VERCEL', '1')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => requireCronSecret(request())).toThrow(expect.objectContaining({ statusCode: 500, message: 'Not configured' }))
  })
})
