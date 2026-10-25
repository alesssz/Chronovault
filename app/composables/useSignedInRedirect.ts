/**
 * Sign-in pages (login, email confirmation): as soon as a session exists,
 * go to the page the user wanted before being sent to sign in (saved by the
 * @nuxtjs/supabase auth middleware), or the library. `replace`: the browser's
 * Back button never returns to the sign-in page. Also covers landing on
 * these pages while already signed in.
 */
export function useSignedInRedirect(): void {
  // Becomes set as soon as a session exists.
  const user = useSupabaseUser()
  // The page saved before sign-in, if any.
  const redirect = useSupabaseCookieRedirect()
  const router = useRouter()

  // A session appeared: go where the user was headed, or the library.
  watch(user, (value) => {
    if (value) void navigateTo(appPageOrNull(router, redirect.pluck()) ?? '/', { replace: true })
  }, { immediate: true })
}

/**
 * The saved path, only if it is a page of the app; null otherwise.
 *
 * Why: the auth middleware saves *any* path it sees without a session,
 * including requests that were never pages. A stale service worker left by a
 * production build on localhost (e.g. `make preview`) keeps fetching /sw.js
 * for updates; in development that file does not exist, so Nuxt renders
 * /sw.js as a page, the middleware saves it, and after signing in the router
 * found no route for it (VUE_ROUTER_R0004). A path matching no route is
 * dropped, and the user lands on the library instead.
 */
function appPageOrNull(router: ReturnType<typeof useRouter>, path: string | null | undefined): string | null {
  // Only same-origin absolute paths: never another site ("//host", "https://…").
  if (!path || !path.startsWith('/') || path.startsWith('//')) return null
  return router.resolve(path).matched.length > 0 ? path : null
}
