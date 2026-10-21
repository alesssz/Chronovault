export type ShareKind = 'track' | 'playlist'

const SHARE_PREFIX: Record<ShareKind, string> = { track: '/t/', playlist: '/p/' }

/**
 * Share links of unlisted/public items: `<site>/t/<track id>` and
 * `<site>/p/<playlist id>`. Anyone with the link can open the public page,
 * without an account.
 */
export function useShareLink() {
  const toast = useToast()
  const origin = useRequestURL().origin

  function shareUrl(id: string, kind: ShareKind = 'track'): string {
    return `${origin}${SHARE_PREFIX[kind]}${id}`
  }

  async function copyShareLink(id: string, kind: ShareKind = 'track'): Promise<void> {
    const url = shareUrl(id, kind)
    try {
      await navigator.clipboard.writeText(url)
      toast.add({ title: 'Share link copied', description: url, icon: 'i-lucide-link', color: 'success' })
    }
    catch {
      // Clipboard not available (e.g. permission denied): show the link to copy by hand.
      toast.add({ title: 'Copy this link', description: url, icon: 'i-lucide-link', duration: 15000 })
    }
  }

  return { shareUrl, copyShareLink }
}
