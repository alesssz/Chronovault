/**
 * Copies text to the clipboard. Resolves to false instead of throwing when
 * the browser refuses (permission denied, insecure context): callers then
 * show the text so it can be copied by hand. Auto-imported (Nuxt scans app/utils).
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  }
  catch {
    return false
  }
}
