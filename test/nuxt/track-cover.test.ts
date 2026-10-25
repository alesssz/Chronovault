/**
 * TrackCover: image with alternative text; without a cover, the Chronovault
 * artwork (decorative: no alternative text).
 */
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import TrackCover from '~/components/track/TrackCover.vue'
import { FALLBACK_COVER } from '~~/shared/brand'

describe('TrackCover', () => {
  it('shows the image with alternative text', async () => {
    // A track with a cover.
    const wrapper = await mountSuspended(TrackCover, {
      props: { url: 'https://example.test/cover.webp', title: 'Night' },
    })
    // Its image.
    const img = wrapper.find('img')
    expect(img.attributes('src')).toBe('https://example.test/cover.webp')
    expect(img.attributes('alt')).toBe('Cover of Night')
  })

  it('shows the artwork without a cover', async () => {
    // A track without a cover.
    const wrapper = await mountSuspended(TrackCover, { props: { url: null, title: 'Night' } })
    // Its image.
    const img = wrapper.find('img')
    expect(img.attributes('src')).toBe(FALLBACK_COVER.app)
    // Not the track's cover: nothing for screen readers to announce.
    expect(img.attributes('alt')).toBe('')
    expect(img.attributes()).toHaveProperty('data-fallback-cover')
  })
})
