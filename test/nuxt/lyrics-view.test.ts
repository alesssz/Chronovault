/**
 * LyricsView in the Nuxt environment: active line, click to seek, section headers, plain lyrics.
 */
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import LyricsView from '~/components/lyrics/LyricsView.vue'

/** Three synced lines: at 1 s, 5 s and 9 s. */
const synced = [
  { time: 0, text: 'First line' },
  { time: 5, text: 'Second line' },
  { time: 10, text: '' },
]

describe('LyricsView', () => {
  it('highlights the line matching the playback time', async () => {
    const wrapper = await mountSuspended(LyricsView, {
      props: { synced, plain: null, currentTime: 6 },
    })
    const active = wrapper.find('[aria-current="true"]')
    expect(active.text()).toBe('Second line')
  })

  it('moves the active line as time advances', async () => {
    const wrapper = await mountSuspended(LyricsView, {
      props: { synced, plain: null, currentTime: 1 },
    })
    expect(wrapper.find('[aria-current="true"]').text()).toBe('First line')

    await wrapper.setProps({ currentTime: 12 })
    // Instrumental lines (empty text) show a musical note.
    expect(wrapper.find('[aria-current="true"]').text()).toBe('♪')
  })

  it('emits seek with the time of the clicked line', async () => {
    const wrapper = await mountSuspended(LyricsView, {
      props: { synced, plain: null, currentTime: 0 },
    })
    const buttons = wrapper.findAll('[data-testid="lyrics-synced"] button')
    await buttons[1]!.trigger('click')
    expect(wrapper.emitted('seek')).toEqual([[5]])
  })

  it('shows section headers between synced lines, never as the active line', async () => {
    // Section headers share their time with the line they introduce.
    const structured = [
      { time: 0, text: '[Intro]', section: true },
      { time: 0, text: 'Hey' },
      { time: 8, text: '[Verse 1]', section: true },
      { time: 8, text: 'First line' },
    ]
    const wrapper = await mountSuspended(LyricsView, {
      props: { synced: structured, plain: null, currentTime: 9 },
    })
    expect(wrapper.findAll('[data-testid="lyrics-section"]').map(s => s.text())).toEqual(['Intro', 'Verse 1'])
    expect(wrapper.find('[aria-current="true"]').text()).toBe('First line')
  })

  it('without sync shows plain lyrics with section headers', async () => {
    const wrapper = await mountSuspended(LyricsView, {
      props: { synced: null, plain: '[Chorus]\nLa la la', currentTime: 0 },
    })
    expect(wrapper.find('[data-testid="lyrics-synced"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Chorus')
    expect(wrapper.text()).not.toContain('[Chorus]')
    expect(wrapper.text()).toContain('La la la')
  })

  it('shows an empty state when there are no lyrics', async () => {
    const wrapper = await mountSuspended(LyricsView, {
      props: { synced: [], plain: null, currentTime: 0 },
    })
    expect(wrapper.text()).toContain('No lyrics')
  })
})
