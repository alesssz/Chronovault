/**
 * Hands a file built in the browser to the user as a download (the browser
 * shows its usual "save" behaviour), without any server round trip.
 */

/**
 * Saves `blob` as `fileName`: a temporary object URL on a hidden link with
 * the `download` attribute, clicked programmatically. The URL is released a
 * minute later, once the browser has certainly started reading it (releasing
 * it at once can cancel large downloads in some browsers).
 */
export function saveFile(blob: Blob, fileName: string): void {
  // A temporary address of the file in memory, revoked a little later.
  const url = URL.createObjectURL(blob)
  // A link the browser follows as a download, never added to the page.
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.rel = 'noopener'
  link.style.display = 'none'
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
