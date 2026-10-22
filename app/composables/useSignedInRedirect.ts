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

  watch(user, (value) => {
    if (value) void navigateTo(redirect.pluck() || '/', { replace: true })
  }, { immediate: true })
}
