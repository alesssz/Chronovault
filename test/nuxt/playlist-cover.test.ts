/**
 * PlaylistCover: custom cover, 2×2 mosaic, single cover, and the Chronovault
 * artwork when there is nothing to show.
 */
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import PlaylistCover from '~/components/playlist/PlaylistCover.vue'
import { FALLBACK_COVER } from '~~/shared/brand'

/** More covers than a mosaic uses (4). */
const covers = ['/a.webp', '/b.webp', '/c.webp', '/d.webp', '/e.webp']

describe('PlaylistCover', () => {
  it('shows the custom cover when there is one', async () => {
    // A playlist with its own cover (and a mosaic it must ignore).
    const wrapper = await mountSuspended(PlaylistCover, { props: { url: '/custom.webp', mosaic: covers, title: 'Mix' } })
    // The images drawn.
    const images = wrapper.findAll('img')
    expect(images).toHaveLength(1)
    expect(images[0]!.attributes('src')).toBe('/custom.webp')
  })

  it('builds a 2×2 mosaic from the first four track covers', async () => {
    // A playlist without its own cover, five track covers to choose from.
    const wrapper = await mountSuspended(PlaylistCover, { props: { url: null, mosaic: covers, title: 'Mix' } })
    expect(wrapper.find('[data-testid="playlist-mosaic"]').exists()).toBe(true)
    expect(wrapper.findAll('img').map(img => img.attributes('src'))).toEqual(covers.slice(0, 4))
  })

  it('uses the first cover alone when there are fewer than four', async () => {
    // A playlist with two track covers only.
    const wrapper = await mountSuspended(PlaylistCover, { props: { url: null, mosaic: covers.slice(0, 2), title: 'Mix' } })
    expect(wrapper.findAll('img').map(img => img.attributes('src'))).toEqual(['/a.webp'])
  })

  it('shows the artwork for an empty playlist', async () => {
    // An empty playlist.
    const wrapper = await mountSuspended(PlaylistCover, { props: { url: null, mosaic: [], title: 'Mix' } })
    // The images drawn.
    const images = wrapper.findAll('img')
    expect(images.map(img => img.attributes('src'))).toEqual([FALLBACK_COVER.app])
    // Decorative: not the playlist's cover.
    expect(images[0]!.attributes('alt')).toBe('')
  })
})
