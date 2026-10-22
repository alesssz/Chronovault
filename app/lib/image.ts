/**
 * Cover image processing, in the browser: every cover (from tags or picked
 * by the user) is stored as a square WebP of at most 800×800.
 *
 * Covers picked by hand go through the crop editor (CoverCropDialog.vue),
 * which works with a `CropView` and turns it into a `CropRect`; covers read
 * from file tags during an upload are center-cropped automatically.
 */

import { clamp } from '~~/shared/utils/numbers'

/** Side length of the stored cover (px). */
export const COVER_SIZE = 800

/** Highest zoom of the crop editor: the square is then 1/5 of the image's shorter side. */
export const MAX_CROP_ZOOM = 5

/** Square source area to draw: top-left corner and side length, in source pixels. */
export interface CropRect {
  x: number
  y: number
  size: number
}

/**
 * What the crop editor shows, independent of the screen size:
 * `zoom` 1 = the largest square that fits in the image, 2 = half as wide…;
 * `cx`/`cy` = center of the square, in source pixels.
 */
export interface CropView {
  zoom: number
  cx: number
  cy: number
}

/** Centered square crop inside a w×h image (automatic cropping). */
export function centerSquareCrop(width: number, height: number): CropRect {
  const size = Math.min(width, height)
  return {
    x: Math.round((width - size) / 2),
    y: Math.round((height - size) / 2),
    size,
  }
}

/** The editor's starting view: the centered, largest square (what automatic cropping picks). */
export function initialCropView(width: number, height: number): CropView {
  return { zoom: 1, cx: width / 2, cy: height / 2 }
}

/** Side of the cropped square at `zoom`, in source pixels. */
export function cropSide(width: number, height: number, zoom: number): number {
  return Math.min(width, height) / zoom
}

/**
 * Keeps a view valid: zoom within 1..MAX_CROP_ZOOM, and the center such that
 * the square never leaves the image (no empty borders in the cover).
 */
export function clampCropView(view: CropView, width: number, height: number): CropView {
  const zoom = clamp(Number.isFinite(view.zoom) ? view.zoom : 1, 1, MAX_CROP_ZOOM)
  const half = cropSide(width, height, zoom) / 2
  return {
    zoom,
    cx: clamp(view.cx, half, width - half),
    cy: clamp(view.cy, half, height - half),
  }
}

/** The view as a crop rectangle in whole source pixels, always inside the image. */
export function cropRectOf(view: CropView, width: number, height: number): CropRect {
  const valid = clampCropView(view, width, height)
  const size = Math.max(1, Math.min(Math.round(cropSide(width, height, valid.zoom)), width, height))
  return {
    x: clamp(Math.round(valid.cx - size / 2), 0, width - size),
    y: clamp(Math.round(valid.cy - size / 2), 0, height - size),
    size,
  }
}

/** A blank canvas of the given size and its 2D context (throws where canvas is unavailable). */
function createCanvas(width: number, height: number): { canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not available')
  return { canvas, ctx }
}

/** Encodes what the canvas holds as an image file (`image/jpeg`, `image/webp`…). */
function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('Image conversion failed'))), type, quality)
  })
}

/** An image re-encoded as JPEG, with its size (needed by the FLAC PICTURE block). */
export interface JpegImage {
  data: Uint8Array
  width: number
  height: number
}

/**
 * Re-encodes an image as JPEG at its own size. Used to embed covers in
 * downloaded files: covers are stored as WebP, which many players do not
 * show when it is inside a tag, while JPEG works everywhere.
 */
export async function toJpeg(source: Blob, quality = 0.9): Promise<JpegImage> {
  const bitmap = await createImageBitmap(source)
  try {
    const { canvas, ctx } = createCanvas(bitmap.width, bitmap.height)
    // JPEG has no transparency: transparent pixels become white instead of black.
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(bitmap, 0, 0)
    const blob = await canvasToBlob(canvas, 'image/jpeg', quality)
    return { data: new Uint8Array(await blob.arrayBuffer()), width: bitmap.width, height: bitmap.height }
  }
  finally {
    bitmap.close()
  }
}

/** Options of toSquareWebp (all optional). */
export interface SquareWebpOptions {
  /** Area to keep, in source pixels; centered square by default. */
  crop?: CropRect
  /** Output side in px (never upscaled). */
  size?: number
  /** WebP quality, 0..1. */
  quality?: number
}

/**
 * Crops (the given area, or the centered square), resizes to at most
 * `size`×`size` and converts to WebP. Everything happens in the browser:
 * storage receives a light file (~50-150 KB).
 */
export async function toSquareWebp(source: Blob, options: SquareWebpOptions = {}): Promise<Blob> {
  const { size = COVER_SIZE, quality = 0.85 } = options
  const bitmap = await createImageBitmap(source)
  try {
    // A crop computed on the <img> of the editor matches the bitmap: both apply
    // the EXIF orientation. Clamping guards against any mismatch anyway.
    const crop = options.crop
      ? cropRectOf(
          { zoom: Math.min(bitmap.width, bitmap.height) / options.crop.size, cx: options.crop.x + options.crop.size / 2, cy: options.crop.y + options.crop.size / 2 },
          bitmap.width,
          bitmap.height,
        )
      : centerSquareCrop(bitmap.width, bitmap.height)
    // Never upscale: a small image keeps its own size.
    const target = Math.min(size, crop.size)
    const { canvas, ctx } = createCanvas(target, target)
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, crop.x, crop.y, crop.size, crop.size, 0, 0, target, target)

    return await canvasToBlob(canvas, 'image/webp', quality)
  }
  finally {
    // Release the decoded image memory right away (it can be tens of MB).
    bitmap.close()
  }
}
