import { describe, expect, it } from 'vitest'
import { centerSquareCrop } from '~/lib/image'
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
