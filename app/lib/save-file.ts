/**
 * Hands a file built in the browser to the user as a download, without any
 * server round trip. The object URL is released a minute later, once the
 * browser has certainly started reading it: releasing it at once can cancel
 * large downloads in some browsers.
 */
export function saveFile(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
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
