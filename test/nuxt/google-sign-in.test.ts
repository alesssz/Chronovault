/**
 * "Continue with Google" on the sign-in page: shown only where the provider is
 * set up (runtimeConfig.public.googleSignIn), and it hands the user to
 * Supabase with /confirm as the way back. The round trip through Google
 * itself cannot run in a test; the e2e tests check the button stays hidden
 * by default and that a refused sign-in is explained on /confirm.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import type { VueWrapper } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import LoginPage from '~/pages/login.vue'

const { signInWithOAuth } = vi.hoisted(() => ({ signInWithOAuth: vi.fn() }))

mockNuxtImport('useSupabaseClient', () => () => ({ auth: { signInWithOAuth } }))
mockNuxtImport('useSupabaseUser', () => () => ref(null))
mockNuxtImport('useSupabaseCookieRedirect', () => () => ({ path: ref(null), pluck: () => null }))

/** The sign-in page's button with this name, if any. */
function button(wrapper: VueWrapper, name: string) {
  return wrapper.findAll('button').find(b => b.text().includes(name))
}

describe('Continue with Google', () => {
  afterEach(() => {
    useRuntimeConfig().public.googleSignIn = false
    signInWithOAuth.mockReset()
  })

  it('is hidden where Google is not set up', async () => {
    const wrapper = await mountSuspended(LoginPage)
    expect(button(wrapper, 'Sign in')).toBeDefined()
    expect(button(wrapper, 'Continue with Google')).toBeUndefined()
  })

  it('signs in through Supabase and comes back to /confirm', async () => {
    useRuntimeConfig().public.googleSignIn = true
    signInWithOAuth.mockResolvedValue({ data: {}, error: null })
    const wrapper = await mountSuspended(LoginPage)

    await button(wrapper, 'Continue with Google')!.trigger('click')

    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/confirm` },
    })
  })
})
