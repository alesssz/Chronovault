/**
 * A media query a server-rendered page can lay itself out by: false on the
 * server and while the page hydrates, the window's own answer once mounted
 * (and as it changes after that).
 *
 * VueUse's useMediaQuery is false on the server, which cannot know the
 * window, but answers at once in the browser, before hydration ends. A
 * `v-if` on it then renders one thing on the server and another in the
 * browser's first pass, and Vue reports a hydration mismatch (the share
 * pages /t and /p from tablet width: the server's in-page player against the
 * browser's player bar). Waiting for the mount makes the first pass match the
 * server's HTML; the page then switches, which is why what the server renders
 * for `false` must already look right on every screen (the share pages hide
 * their in-page player from `md` by CSS, and the bar that replaces it is
 * fixed, so nothing moves).
 */
export function useMountedMediaQuery(query: string): ComputedRef<boolean> {
  // The window's answer, live.
  const matches = useMediaQuery(query)
  // True once the component is mounted: hydration is over.
  const mounted = useMounted()
  return computed(() => mounted.value && matches.value)
}
