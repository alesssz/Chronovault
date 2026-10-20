import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import TrackCover from '~/components/track/TrackCover.vue'

describe('TrackCover', () => {
  it('shows the image with alternative text', async () => {
    const wrapper = await mountSuspended(TrackCover, {
      props: { url: 'https://example.test/cover.webp', title: 'Night' },
    })
    const img = wrapper.find('img')
    expect(img.attributes('src')).toBe('https://example.test/cover.webp')
    expect(img.attributes('alt')).toBe('Cover of Night')
  })

  it('shows a placeholder without a cover', async () => {
    const wrapper = await mountSuspended(TrackCover, { props: { url: null } })
    expect(wrapper.find('img').exists()).toBe(false)
  })
})
