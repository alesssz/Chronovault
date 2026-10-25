/**
 * End-to-end, cover cropping: a non-square image goes through the crop
 * editor, and the stored cover is really the part the user chose (checked
 * on the pixels of the uploaded WebP).
 */
import { expect, test } from '@playwright/test'
import { signUp, uniqueId, uploadTrack } from './helpers'

test.describe('cover cropping', () => {
  test('the stored cover is the square chosen in the crop editor', async ({ page }) => {
    await signUp(page)
    // A title unique to this test.
    const title = `crop-${uniqueId()}`
    await uploadTrack(page, title)
    await page.getByRole('link', { name: 'Go to library' }).click()
    // The library row of the new track.
    const row = page.getByTestId('track-row').filter({ hasText: title })
    await row.getByRole('button', { name: `Actions for ${title}` }).click()
    await page.getByRole('menuitem', { name: 'Edit' }).click()

    // A 400×200 PNG: left half red, right half blue.
    const png = await page.evaluate(async () => {
      const canvas = document.createElement('canvas')
      canvas.width = 400
      canvas.height = 200
      // Two halves of different colours: the crop must keep one.
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#ff0000'
      ctx.fillRect(0, 0, 200, 200)
      ctx.fillStyle = '#0000ff'
      ctx.fillRect(200, 0, 200, 200)
      // The drawing as a PNG file.
      const blob = await new Promise<Blob>(resolve => canvas.toBlob(b => resolve(b!), 'image/png'))
      return Array.from(new Uint8Array(await blob.arrayBuffer()))
    })
    await page.getByTestId('cover-input').setInputFiles({ name: 'halves.png', mimeType: 'image/png', buffer: Buffer.from(png) })

    // The editor opens on the centered square (half red, half blue)…
    const frame = page.getByTestId('crop-frame')
    await expect(frame).toBeVisible()
    await expect(page.getByTestId('crop-confirm')).toBeEnabled()
    // …move the picture left until the square sits on the blue half.
    await frame.focus()
    for (let i = 0; i < 6; i++) await page.keyboard.press('Shift+ArrowLeft')
    await page.getByTestId('crop-confirm').click()
    await expect(page.getByText('Cover updated').first()).toBeVisible()

    // The uploaded cover is entirely blue.
    const cover = page.getByRole('img', { name: `Cover of ${title}` }).first()
    await expect(cover).toHaveAttribute('src', /^\/api\/covers\/tracks\/[0-9a-f-]+\?v=/)
    // The colours of the stored cover, read in the page.
    const pixels = await cover.evaluate(async (img: HTMLImageElement) => {
      // The cover as the app serves it, decoded.
      const bitmap = await createImageBitmap(await (await fetch(img.src)).blob())
      // A canvas the size of the cover, to read its pixels.
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      // Its drawing context.
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(bitmap, 0, 0)
      // RGB of one pixel of the stored cover.
      const at = (x: number, y: number) => Array.from(ctx.getImageData(x, y, 1, 1).data.slice(0, 3))
      return { size: [bitmap.width, bitmap.height], left: at(5, 100), center: at(100, 100), right: at(194, 100) }
    })
    expect(pixels.size).toEqual([200, 200])
    for (const [r, g, b] of [pixels.left, pixels.center, pixels.right]) {
      expect(b!).toBeGreaterThan(200)
      expect(r!).toBeLessThan(40)
      expect(g!).toBeLessThan(40)
    }
  })
})
