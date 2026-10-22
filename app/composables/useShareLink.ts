/** What a link points to. */
export type ShareKind = 'track' | 'playlist'

/** Public page path of each kind. */
const SHARE_PREFIX: Record<ShareKind, string> = { track: '/t/', playlist: '/p/' }

/**
 * Share links of unlisted/public items: `<site>/t/<track id>` and
 * `<site>/p/<playlist id>`. Anyone with the link can open the public page,
 * without an account.
 */
export function useShareLink() {
  // Confirms the copy (or shows the link to copy by hand).
  const toast = useToast()
  // The site the app is served from (also correct on Vercel previews).
  const origin = useRequestURL().origin

  /** Absolute URL of the public page. */
  function shareUrl(id: string, kind: ShareKind = 'track'): string {
    return `${origin}${SHARE_PREFIX[kind]}${id}`
  }

  /** Copies the link to the clipboard and confirms with a toast (showing the link). */
  async function copyShareLink(id: string, kind: ShareKind = 'track'): Promise<void> {
    const url = shareUrl(id, kind)
    if (await copyText(url)) {
      toast.add({ title: 'Share link copied', description: url, icon: 'i-lucide-link', color: 'success' })
    }
    else {
      // Clipboard not available (e.g. permission denied): show the link to copy by hand.
      toast.add({ title: 'Copy this link', description: url, icon: 'i-lucide-link', duration: 15000 })
    }
  }

  return { shareUrl, copyShareLink }
}
