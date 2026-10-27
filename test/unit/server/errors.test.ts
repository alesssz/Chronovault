/**
 * Database errors turned into HTTP errors (server/utils/errors.ts): the
 * expected codes keep a 4xx with a generic message, the caps on anonymous
 * writes answer 429, and anything else is a logged 500 that reveals nothing.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { toHttpError } from '~~/server/utils/errors'

describe('toHttpError', () => {
  afterEach(() => vi.restoreAllMocks())

  it('answers 429 when a plays or votes cap is reached (53400)', () => {
    // The error record_play and cast_version_vote raise past their caps.
    const error = toHttpError({ code: '53400', message: 'too many votes in this group' }, 'feedback.vote')
    expect(error.statusCode).toBe(429)
    expect(error.message).toBe('Limit reached')
  })

  it('keeps the other expected codes (voting closed: 409)', () => {
    expect(toHttpError({ code: '55000', message: 'voting is closed' }, 'feedback.vote').statusCode).toBe(409)
  })

  it('answers 400 for a character Postgres cannot store (a NUL past the schemas), not 500', () => {
    expect(toHttpError({ code: '22P05', message: 'unsupported Unicode escape sequence' }, 'tracks.update').statusCode).toBe(400)
    expect(toHttpError({ code: '22021', message: 'invalid byte sequence for encoding "UTF8": 0x00' }, 'tracks.update').statusCode).toBe(400)
  })

  it('turns an unknown error into a 500 without its technical message, logged on the server', () => {
    // The server log, silenced and checked.
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const error = toHttpError({ code: 'XX000', message: 'internal detail' }, 'tracks.insert')
    expect(error.statusCode).toBe(500)
    expect(error.message).toBe('Internal error')
    expect(log).toHaveBeenCalledWith('[tracks.insert]', expect.objectContaining({ message: 'internal detail' }))
  })
})
