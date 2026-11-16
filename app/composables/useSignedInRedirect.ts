/**
 * Sign-in pages (login, email confirmation): as soon as a session exists,
 * go to the page the user wanted before being sent to sign in (saved by the
 * @nuxtjs/supabase auth middleware), or the library. `replace`: the browser's
 * Back button never returns to the sign-in page. Also covers landing on
 * these pages while already signed in.
 */
export function useSignedInRedirect(): void {
  const user = useSupabaseUser()
  // The page saved before sign-in, if any.
  const redirect = useSupabaseCookieRedirect()
  const router = useRouter()

  watch(user, (value) => {
    if (value) void navigateTo(appPageOrNull(router, redirect.pluck()) ?? '/', { replace: true })
  }, { immediate: true })
}

/**
 * The saved path, only if it is a page of the app; null otherwise.
 *
 * The auth middleware saves *any* path it sees without a session, including
 * requests that are not pages: a stale service worker left on localhost by a
 * production build (`make preview`) keeps fetching /sw.js for updates, which
 * development renders as a page. A path matching no route is dropped, so the
 * user lands on the library instead of a router error.
 */
function appPageOrNull(router: ReturnType<typeof useRouter>, path: string | null | undefined): string | null {
  // Only same-origin absolute paths: never another site ("//host", "https://…").
  if (!path || !path.startsWith('/') || path.startsWith('//')) return null
  return router.resolve(path).matched.length > 0 ? path : null
}
