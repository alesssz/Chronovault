/**
 * PlaylistCover: custom cover, 2×2 mosaic, single cover, placeholder.
 */
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import PlaylistCover from '~/components/playlist/PlaylistCover.vue'

const covers = ['/a.webp', '/b.webp', '/c.webp', '/d.webp', '/e.webp']

describe('PlaylistCover', () => {
  it('shows the custom cover when there is one', async () => {
    const wrapper = await mountSuspended(PlaylistCover, { props: { url: '/custom.webp', mosaic: covers, title: 'Mix' } })
    const images = wrapper.findAll('img')
    expect(images).toHaveLength(1)
    expect(images[0]!.attributes('src')).toBe('/custom.webp')
  })

  it('builds a 2×2 mosaic from the first four track covers', async () => {
    const wrapper = await mountSuspended(PlaylistCover, { props: { url: null, mosaic: covers, title: 'Mix' } })
    expect(wrapper.find('[data-testid="playlist-mosaic"]').exists()).toBe(true)
    expect(wrapper.findAll('img').map(img => img.attributes('src'))).toEqual(covers.slice(0, 4))
  })

  it('uses the first cover alone when there are fewer than four', async () => {
    const wrapper = await mountSuspended(PlaylistCover, { props: { url: null, mosaic: covers.slice(0, 2), title: 'Mix' } })
    expect(wrapper.findAll('img').map(img => img.attributes('src'))).toEqual(['/a.webp'])
  })

  it('shows a placeholder for an empty playlist', async () => {
    const wrapper = await mountSuspended(PlaylistCover, { props: { url: null, mosaic: [], title: 'Mix' } })
    expect(wrapper.find('img').exists()).toBe(false)
  })
})
