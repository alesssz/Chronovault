/** Side length of the stored cover (px). */
export const COVER_SIZE = 800

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
    bitmap.close()
  }
}
