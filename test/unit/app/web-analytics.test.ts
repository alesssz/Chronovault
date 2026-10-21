/**
 * Which pages Vercel Web Analytics may count (app/lib/web-analytics.ts):
 * the share pages only, exactly the paths the Statistics page queries.
 */
import { describe, expect, it } from 'vitest'
import { isSharePagePath } from '~/lib/web-analytics'

describe('isSharePagePath', () => {
  it('accepts track and playlist share pages', () => {
    expect(isSharePagePath('/t/22222222-2222-4222-8222-222222222222')).toBe(true)
    expect(isSharePagePath('/p/33333333-3333-4333-8333-333333333333')).toBe(true)
  })

  it('rejects the private app pages and anything else', () => {
    for (const path of ['/', '/playlists', '/playlists/abc', '/tracks/abc/edit', '/stats', '/login', '/t/', '/t/abc/extra', '/x/abc']) {
      expect(isSharePagePath(path), path).toBe(false)
    }
  })
})
