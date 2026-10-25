/**
 * IconButton: one label for the accessible name and the tooltip; every other
 * attribute reaches the button. Mounted inside UApp, which provides the
 * tooltips' context as it does in the app.
 */
import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { UApp } from '#components'
import IconButton from '~/components/IconButton.vue'

/** IconButton with these props and attributes, inside UApp. */
function inApp(props: Record<string, unknown>) {
  return defineComponent({ render: () => h(UApp, null, { default: () => h(IconButton, props as { label: string }) }) })
}

describe('IconButton', () => {
  it('names the button with its label and passes the rest to it', async () => {
    // The button with a label, an icon and props for UButton.
    const wrapper = await mountSuspended(inApp({ 'label': 'Next track', 'icon': 'i-lucide-skip-forward', 'data-testid': 'next', 'disabled': true }))
    // The rendered <button>.
    const button = wrapper.find('button')
    expect(button.attributes('aria-label')).toBe('Next track')
    expect(button.attributes('data-testid')).toBe('next')
    expect(button.attributes('disabled')).toBeDefined()
    // Icon only: the label is not written inside the button.
    expect(button.text()).toBe('')
  })
})
