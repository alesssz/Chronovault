/**
 * useSignedInRedirect: once signed in, go back to the page saved before
 * sign-in, but only when it is a page of the app. Anything else saved by the
 * auth middleware (e.g. /sw.js, requested by a stale service worker) falls
 * back to the library instead of a router "no match" error.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { useSignedInRedirect } from '~/composables/useSignedInRedirect'

// Hoisted with the mocks below: a signed-in user, the saved path, the navigation spy.
const { user, saved, navigate } = vi.hoisted(() => ({
  user: { value: { id: 'user-1' } as unknown },
  saved: { value: null as string | null },
  navigate: vi.fn(),
}))

mockNuxtImport('useSupabaseUser', () => () => ref(user.value))
mockNuxtImport('useSupabaseCookieRedirect', () => () => ({
  path: ref(saved.value),
  pluck: () => saved.value,
}))
mockNuxtImport('navigateTo', () => navigate)

describe('useSignedInRedirect', () => {
  beforeEach(() => {
    navigate.mockReset()
  })

  /** Runs the composable with this saved path; returns where it navigated. */
  function redirectWith(path: string | null) {
    saved.value = path
    useSignedInRedirect()
    expect(navigate).toHaveBeenCalledOnce()
    return navigate.mock.calls[0]![0]
  }

  it('returns to the saved page when it is a page of the app', () => {
    expect(redirectWith('/playlists/abc?sort=title')).toBe('/playlists/abc?sort=title')
  })

  it('goes to the library when nothing was saved', () => {
    expect(redirectWith(null)).toBe('/')
  })

  it('ignores a saved path that matches no page (a stale service worker\'s /sw.js)', () => {
    expect(redirectWith('/sw.js')).toBe('/')
  })

  it('never leaves the site with a protocol-relative path', () => {
    expect(redirectWith('//evil.example/playlists')).toBe('/')
  })

  it('never leaves the site with a full URL', () => {
    expect(redirectWith('https://evil.example/')).toBe('/')
  })
})
