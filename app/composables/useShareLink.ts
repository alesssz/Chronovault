/** What a link points to. */
export type ShareKind = 'track' | 'playlist'

/** Public page path of each kind. */
const SHARE_PREFIX: Record<ShareKind, string> = { track: '/t/', playlist: '/p/' }

/**
 * Whether links go through the device's share sheet: a touch screen whose
 * browser has the Web Share API (Android, iPhone, iPad). There the sheet
 * lists the apps to send the link with (WhatsApp, Telegram, mail…), which is
 * what people expect on a phone. With a mouse the link is copied instead,
 * as before: desktop share sheets are rarely what anyone wants to paste from.
 */
function detectNativeShare(): boolean {
  return typeof navigator !== 'undefined'
    && typeof navigator.share === 'function'
    && window.matchMedia('(pointer: coarse)').matches
}

/**
 * Share links of unlisted/public items: `<site>/t/<track id>` and
 * `<site>/p/<playlist id>`. Anyone with the link can open the public page,
 * without an account.
 *
 * `shareLink` is the one action buttons and menus call: the device's share
 * sheet where it fits (see detectNativeShare), otherwise a copy to the
 * clipboard. `nativeShare` tells which, for the labels ("Share link" or
 * "Copy share link"); it is false until mounted, so the server-rendered
 * HTML and the first client render agree.
 */
export function useShareLink() {
  // Confirms the copy (or shows the link to copy by hand).
  const toast = useToast()
  // The site the app is served from (also correct on Vercel previews).
  const origin = useRequestURL().origin

  /** The share sheet is used instead of the clipboard (decided in the browser, after mount). */
  const nativeShare = ref(false)
  // Decided in the browser only: the server cannot know.
  onMounted(() => {
    nativeShare.value = detectNativeShare()
  })

  /** Absolute URL of the public page. */
  function shareUrl(id: string, kind: ShareKind = 'track'): string {
    return `${origin}${SHARE_PREFIX[kind]}${id}`
  }

  /** Copies the link to the clipboard and confirms with a toast (showing the link). */
  async function copyShareLink(id: string, kind: ShareKind = 'track'): Promise<void> {
    // The page's full address.
    const url = shareUrl(id, kind)
    if (await copyText(url)) {
      toast.add({ title: 'Share link copied', description: url, icon: 'i-lucide-link', color: 'success' })
    }
    else {
      // Clipboard not available (e.g. permission denied): show the link to copy by hand.
      toast.add({ title: 'Copy this link', description: url, icon: 'i-lucide-link', duration: 15000 })
    }
  }

  /**
   * Shares the link: through the device's share sheet on touch screens,
   * otherwise by copying it.
   *
   * @param title shown by the share sheet and by the receiving app (the track or playlist name).
   */
  async function shareLink(id: string, kind: ShareKind = 'track', title?: string): Promise<void> {
    if (!nativeShare.value) return copyShareLink(id, kind)
    try {
      await navigator.share({ title, url: shareUrl(id, kind) })
    }
    catch (error) {
      // The user closed the sheet without picking an app: nothing to do.
      if (error instanceof DOMException && error.name === 'AbortError') return
      // Refused (e.g. too long after the tap, after a slow request): copy instead.
      await copyShareLink(id, kind)
    }
  }

  return { shareUrl, copyShareLink, shareLink, nativeShare }
}
