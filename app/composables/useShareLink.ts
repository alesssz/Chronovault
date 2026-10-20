/**
 * Share links of unlisted/public tracks: `<site>/t/<track id>`.
 * Anyone with the link can open the public page, without an account.
 */
export function useShareLink() {
  const toast = useToast()
  const origin = useRequestURL().origin

  function shareUrl(trackId: string): string {
    return `${origin}/t/${trackId}`
  }

  async function copyShareLink(trackId: string): Promise<void> {
    const url = shareUrl(trackId)
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
