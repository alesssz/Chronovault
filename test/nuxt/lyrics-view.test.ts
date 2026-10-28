/**
 * LyricsView in the Nuxt environment: active line, click to seek, section headers, plain lyrics,
 * the empty state (the hint to add lyrics for the owner only), and the auto-scroll following the
 * right line when another track's lyrics replace the ones shown.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
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
    // The lyrics view at 12 s.
    const wrapper = await mountSuspended(LyricsView, {
      props: { synced, plain: null, currentTime: 6 },
    })
    // The highlighted line.
    const active = wrapper.find('[aria-current="true"]')
    expect(active.text()).toBe('Second line')
  })

  it('moves the active line as time advances', async () => {
    // The lyrics view at the start.
    const wrapper = await mountSuspended(LyricsView, {
      props: { synced, plain: null, currentTime: 1 },
    })
    expect(wrapper.find('[aria-current="true"]').text()).toBe('First line')

    await wrapper.setProps({ currentTime: 12 })
    // Instrumental lines (empty text) show a musical note.
    expect(wrapper.find('[aria-current="true"]').text()).toBe('♪')
  })

  it('emits seek with the time of the clicked line', async () => {
    // The lyrics view.
    const wrapper = await mountSuspended(LyricsView, {
      props: { synced, plain: null, currentTime: 0 },
    })
    // One button per synced line.
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
    // The lyrics view with section headers.
    const wrapper = await mountSuspended(LyricsView, {
      props: { synced: structured, plain: null, currentTime: 9 },
    })
    expect(wrapper.findAll('[data-testid="lyrics-section"]').map(s => s.text())).toEqual(['Intro', 'Verse 1'])
    expect(wrapper.find('[aria-current="true"]').text()).toBe('First line')
  })

  it('without sync shows plain lyrics with section headers', async () => {
    // The lyrics view with plain lyrics only.
    const wrapper = await mountSuspended(LyricsView, {
      props: { synced: null, plain: '[Chorus]\nLa la la', currentTime: 0 },
    })
    expect(wrapper.find('[data-testid="lyrics-synced"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Chorus')
    expect(wrapper.text()).not.toContain('[Chorus]')
    expect(wrapper.text()).toContain('La la la')
  })

  it('shows an empty state when there are no lyrics', async () => {
    // The lyrics view without any lyrics.
    const wrapper = await mountSuspended(LyricsView, {
      props: { synced: [], plain: null, currentTime: 0 },
    })
    expect(wrapper.text()).toContain('No lyrics')
  })

  it('without lyrics, invites the owner to add some, but not a share page\'s visitor', async () => {
    // The owner's view, then a visitor's (public pages pass `shared`).
    const owner = await mountSuspended(LyricsView, { props: { synced: null, plain: null, currentTime: 0 } })
    const visitor = await mountSuspended(LyricsView, { props: { synced: null, plain: null, currentTime: 0, shared: true } })

    expect(owner.text()).toContain('No lyrics')
    expect(owner.text()).toContain('edit page')
    expect(visitor.text()).toContain('No lyrics')
    expect(visitor.text()).not.toContain('edit page')
  })

  describe('auto-scroll', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('scrolls to the active line of new lyrics, not to another one', async () => {
      // No layout in the test DOM: each synced line sits 100 px under the previous one, the box at 0.
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
        // A line's place in its list (-1 for the box itself, at the top).
        const place = this.tagName === 'LI' ? Array.from(this.parentElement!.children).indexOf(this) : -1
        return { top: Math.max(place, 0) * 100 } as DOMRect
      })
      // Where the box was asked to scroll, each time.
      const scrolls: number[] = []
      vi.spyOn(HTMLElement.prototype, 'scrollTo').mockImplementation(function (options?: ScrollToOptions | number) {
        scrolls.push((options as ScrollToOptions).top!)
      })
      // One track's lyrics, then another track's in the same view (the full-screen player moving on).
      const first = [{ time: 0, text: 'A1' }, { time: 4, text: 'A2' }, { time: 8, text: 'A3' }, { time: 12, text: 'A4' }]
      const second = [{ time: 1, text: 'B1' }, { time: 6, text: 'B2' }, { time: 11, text: 'B3' }, { time: 16, text: 'B4' }]
      // The view on the first track's lyrics, at their start.
      const wrapper = await mountSuspended(LyricsView, { props: { synced: first, plain: null, currentTime: 0 } })
      await wrapper.setProps({ synced: second, currentTime: 0 })
      // The second track reaches its second line: the box scrolls to it (100 px down), the line highlighted.
      await wrapper.setProps({ currentTime: 7 })
      expect(wrapper.find('[aria-current="true"]').text()).toBe('B2')
      // Before: the line elements of the new lyrics were listed in reverse, and the box scrolled to B3.
      expect(scrolls.at(-1)).toBe(100)
    })
  })
})
