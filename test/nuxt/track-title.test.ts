/**
 * TrackTitle: the title's end in a piece of its own that never truncates, the
 * rest truncating; the whole title reads unchanged.
 */
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import TrackTitle from '~/components/track/TrackTitle.vue'

describe('TrackTitle', () => {
  it('truncates all but the end of the title', async () => {
    const wrapper = await mountSuspended(TrackTitle, { props: { title: 'The Silver Mask of Hierusalem 2' } })
    const [head, end] = wrapper.findAll('span > span')
    expect(head!.text()).toBe('The Silver Mask of Hierusalem')
    expect(head!.classes()).toContain('truncate')
    expect(end!.element.textContent).toBe(' 2')
    expect(end!.classes()).toContain('shrink-0')
    expect(wrapper.element.textContent).toBe('The Silver Mask of Hierusalem 2')
  })

  it('truncates a single word as a whole', async () => {
    const wrapper = await mountSuspended(TrackTitle, { props: { title: 'Rain' } })
    expect(wrapper.findAll('span > span')).toHaveLength(0)
    expect(wrapper.text()).toBe('Rain')
    expect(wrapper.classes()).toContain('truncate')
  })
})
