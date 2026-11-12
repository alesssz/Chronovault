/**
 * The genre fields and lists: the editor's subgenre select, disabled until a
 * genre is chosen; the import page's genre reference, searched by name, the
 * user's own subgenres marked, and listed on their own to rename.
 */
import { describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { defineComponent, h, ref, type Component } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { UApp } from '#components'
import type { Genre } from '~~/shared/types/track'
import GenreReference from '~/components/GenreReference.vue'
import OwnSubgenres from '~/components/OwnSubgenres.vue'
import TrackSubgenreSelect from '~/components/track/TrackSubgenreSelect.vue'

// Hoisted with the mock below: the genre list useGenres gives, and its rename (a spy).
const { GENRES, renameSubgenre } = vi.hoisted(() => ({
  renameSubgenre: vi.fn(async () => ({})),
  GENRES: [
    {
      id: 'g-metal',
      name: 'Metal',
      subgenres: [
        { id: 's-bog', genreId: 'g-metal', name: 'Bog Metal', custom: true },
        { id: 's-thrash', genreId: 'g-metal', name: 'Thrash Metal', custom: false },
      ],
    },
    { id: 'g-pop', name: 'Pop', subgenres: [{ id: 's-kpop', genreId: 'g-pop', name: 'K-Pop', custom: false }] },
  ] as Genre[],
}))

mockNuxtImport('useGenres', () => () => ({
  genres: ref(GENRES),
  createSubgenre: async () => GENRES[0]!.subgenres[0]!,
  renameSubgenre,
  deleteSubgenre: async () => {},
}))

/**
 * A component inside UApp, as in the real app: its tooltips (IconButton's)
 * and dialogs need UApp's providers.
 */
async function mountInApp(component: Component, props: Record<string, unknown>) {
  // A host rendering the component inside UApp.
  const Host = defineComponent({ render: () => h(UApp, null, () => h(component, props)) })
  return mountSuspended(Host)
}

/** The subgenre select for a genre, inside UApp (as in the real app). */
async function mountSelect(genreId: string | null) {
  // A host rendering the select, as the editor does.
  const Host = defineComponent({
    render: () => h(UApp, null, () => h(TrackSubgenreSelect, { genreId, modelValue: null })),
  })
  return mountSuspended(Host)
}

describe('TrackSubgenreSelect', () => {
  it('is disabled until a genre is chosen, and says so', async () => {
    // The select without a genre.
    const wrapper = await mountSelect(null)
    // The select's trigger.
    const trigger = wrapper.find('[data-testid="subgenre-select"]')
    expect(trigger.attributes('disabled')).toBeDefined()
    expect(trigger.text()).toContain('Choose a genre first')
  })

  it('takes a subgenre once a genre is chosen', async () => {
    // The select under Metal.
    const wrapper = await mountSelect('g-metal')
    // The select's trigger.
    const trigger = wrapper.find('[data-testid="subgenre-select"]')
    expect(trigger.attributes('disabled')).toBeUndefined()
    expect(trigger.text()).toContain('Select a subgenre')
  })
})

describe('GenreReference', () => {
  /** The reference, mounted, with what it shows. */
  async function mountReference() {
    // The reference with the two genres (inside UApp: it holds the user's own, with tooltips).
    const wrapper = await mountInApp(GenreReference, { genres: GENRES })
    return {
      wrapper,
      genres: () => wrapper.findAll('[data-testid="genre-reference-genre"]').map(g => g.text()),
      subgenres: () => wrapper.findAll('[data-testid="genre-reference-subgenre"]').map(s => s.text().replace(/,\s*$/, '')),
      search: (text: string) => wrapper.find('input[data-testid="genre-reference-search"], [data-testid="genre-reference-search"] input').setValue(text),
    }
  }

  it('lists every genre with its subgenres, the user\'s own marked', async () => {
    const reference = await mountReference()
    expect(reference.genres()).toEqual(['Metal', 'Pop'])
    expect(reference.subgenres()).toEqual(['Bog Metalyours', 'Thrash Metal', 'K-Pop'])
  })

  it('filters by name: a subgenre under its genre, or a genre with all of its own', async () => {
    const reference = await mountReference()
    await reference.search('THRASH')
    expect(reference.genres()).toEqual(['Metal'])
    expect(reference.subgenres()).toEqual(['Thrash Metal'])

    await reference.search('pop')
    expect(reference.genres()).toEqual(['Pop'])
    expect(reference.subgenres()).toEqual(['K-Pop'])

    await reference.search('polka')
    expect(reference.genres()).toEqual([])
    expect(reference.wrapper.text()).toContain('No genre or subgenre matches “polka”')
  })
})

describe('OwnSubgenres', () => {
  /** The list, mounted with the two genres (one subgenre of the user's, Bog Metal). */
  async function mountOwn(genres: Genre[] = GENRES) {
    renameSubgenre.mockClear()
    return mountInApp(OwnSubgenres, { genres })
  }

  it('lists only the user\'s own subgenres, each with its genre', async () => {
    const wrapper = await mountOwn()
    expect(wrapper.findAll('[data-testid="own-subgenre-label"]').map(l => l.text())).toEqual(['Metal › Bog Metal'])
  })

  it('shows nothing when the user has none', async () => {
    // Only the built-in subgenres.
    const builtin = GENRES.map(genre => ({ ...genre, subgenres: genre.subgenres.filter(s => !s.custom) }))
    const wrapper = await mountOwn(builtin)
    expect(wrapper.find('[data-testid="own-subgenres"]').exists()).toBe(false)
  })

  it('renames in place: the field starts with the name, Save sends the new one and closes it', async () => {
    const wrapper = await mountOwn()
    await wrapper.find('[data-testid="own-subgenre-rename"]').trigger('click')
    // The field, under its wrapper or as the input itself.
    const input = wrapper.find('input[data-testid="own-subgenre-name"], [data-testid="own-subgenre-name"] input')
    expect((input.element as HTMLInputElement).value).toBe('Bog Metal')

    // A new name with spaces around it, submitted as Enter or Save would.
    await input.setValue('  Swamp Metal ')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    // Sent trimmed, and the row is back to its label.
    expect(renameSubgenre).toHaveBeenCalledWith('s-bog', 'Swamp Metal')
    expect(wrapper.find('form').exists()).toBe(false)
  })

  it('closes without a request when the name did not change', async () => {
    const wrapper = await mountOwn()
    await wrapper.find('[data-testid="own-subgenre-rename"]').trigger('click')
    // Submitted as it opened, with the current name.
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(renameSubgenre).not.toHaveBeenCalled()
    expect(wrapper.find('form').exists()).toBe(false)
  })
})
