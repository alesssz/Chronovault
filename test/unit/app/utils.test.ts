/**
 * Small browser-side helpers: cover crop geometry (automatic and crop editor) and error messages.
 */
import { describe, expect, it } from 'vitest'
import { MAX_CROP_ZOOM, centerSquareCrop, clampCropView, cropRectOf, cropSide, initialCropView } from '~/lib/image'
import { getErrorMessage } from '~/utils/errors'

describe('centerSquareCrop', () => {
  it('center-crops landscape images', () => {
    expect(centerSquareCrop(1600, 900)).toEqual({ x: 350, y: 0, size: 900 })
  })

  it('center-crops portrait images', () => {
    expect(centerSquareCrop(600, 1000)).toEqual({ x: 0, y: 200, size: 600 })
  })

  it('leaves square images untouched', () => {
    expect(centerSquareCrop(500, 500)).toEqual({ x: 0, y: 0, size: 500 })
  })
})

describe('getErrorMessage', () => {
  it('prefers the message returned by the API', () => {
    expect(getErrorMessage({ message: 'FetchError 400', data: { message: 'Invalid data' } })).toBe('Invalid data')
  })

  it('uses the message of standard errors', () => {
    expect(getErrorMessage(new Error('Network down'))).toBe('Network down')
  })

  it('uses the fallback text for unknown values', () => {
    expect(getErrorMessage(undefined, 'Oops')).toBe('Oops')
    expect(getErrorMessage({})).toBe('Something went wrong')
  })
})

describe('crop editor geometry', () => {
  // A landscape image, 2000×1000: the largest square is 1000×1000.
  // Image size used by most cases below.
  const W = 2000
  const H = 1000

  it('starts on the centered largest square, like automatic cropping', () => {
    expect(cropRectOf(initialCropView(W, H), W, H)).toEqual(centerSquareCrop(W, H))
  })

  it('zoom shrinks the square around its center', () => {
    expect(cropSide(W, H, 2)).toBe(500)
    expect(cropRectOf({ zoom: 2, cx: 1000, cy: 500 }, W, H)).toEqual({ x: 750, y: 250, size: 500 })
  })

  it('keeps the square inside the image, whatever the center asked for', () => {
    expect(cropRectOf({ zoom: 1, cx: 5000, cy: -300 }, W, H)).toEqual({ x: 1000, y: 0, size: 1000 })
    expect(cropRectOf({ zoom: 2, cx: 0, cy: 0 }, W, H)).toEqual({ x: 0, y: 0, size: 500 })
  })

  it('limits the zoom to 1..MAX_CROP_ZOOM', () => {
    expect(clampCropView({ zoom: 0.2, cx: 1000, cy: 500 }, W, H).zoom).toBe(1)
    expect(clampCropView({ zoom: 99, cx: 1000, cy: 500 }, W, H).zoom).toBe(MAX_CROP_ZOOM)
    expect(clampCropView({ zoom: Number.NaN, cx: 1000, cy: 500 }, W, H).zoom).toBe(1)
  })

  it('works for portrait images too', () => {
    // 600×900: the square is 600 wide and can only move vertically.
    expect(cropRectOf({ zoom: 1, cx: 300, cy: 900 }, 600, 900)).toEqual({ x: 0, y: 300, size: 600 })
  })
})
