/**
 * Cover image processing, in the browser: every cover (from tags or picked
 * by the user) is stored as a square WebP of at most 800×800.
 */

/** Side length of the stored cover (px). */
export const COVER_SIZE = 800

/** Square source area to draw: top-left corner and side length, in source pixels. */
export interface CropRect {
  x: number
  y: number
  size: number
}

/** Centered square crop inside a w×h image. */
export function centerSquareCrop(width: number, height: number): CropRect {
  const size = Math.min(width, height)
  return {
    x: Math.round((width - size) / 2),
    y: Math.round((height - size) / 2),
    size,
  }
}

/**
 * Center-crops, resizes to `size`×`size` and converts to WebP.
 * Everything happens in the browser: storage receives a light file (~50-150 KB).
 */
export async function toSquareWebp(source: Blob, size = COVER_SIZE, quality = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(source)
  try {
    const crop = centerSquareCrop(bitmap.width, bitmap.height)
    // Never upscale: a small image keeps its own size.
    const target = Math.min(size, crop.size)
    const canvas = document.createElement('canvas')
    canvas.width = target
    canvas.height = target
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas not available')
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, crop.x, crop.y, crop.size, crop.size, 0, 0, target, target)

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('Image conversion failed'))), 'image/webp', quality)
    })
  }
  finally {
    // Release the decoded image memory right away (it can be tens of MB).
    bitmap.close()
  }
}
