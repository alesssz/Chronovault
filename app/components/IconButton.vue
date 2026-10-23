<script setup lang="ts">
/**
 * A button that shows only an icon, with its name in a tooltip.
 *
 * `label` is said once and used twice: as the accessible name (aria-label,
 * what screen readers and the e2e tests use) and as the tooltip text, so the
 * two can never drift apart. Everything else (icon, color, variant, size,
 * disabled, loading, to, @click, data-testid…) goes to the UButton as is,
 * typed as UButton's own props.
 *
 * Every icon-only button of the app uses it, menu triggers included: inside
 * a UDropdownMenu the trigger's attributes and events reach the inner
 * button through `$attrs`. Buttons that show their text from `sm` up keep
 * a plain UButton (a tooltip would repeat what is written). Tooltips do not
 * open on touch screens or on disabled buttons; the aria-label still names
 * the button there. Tooltips open above the button (in the player bar a
 * tooltip below would cover the waveform), and below when there is no room
 * above, as for the header.
 *
 * UButton's props are only types here (the vue-ignore marker on `extends`),
 * not runtime props, so they stay in `$attrs` and reach the UButton
 * unchanged. Careful: Vue skips the whole interface when a comment right
 * above it contains that marker with its at sign, `label` included.
 */
import type { ButtonProps } from '@nuxt/ui'

interface IconButtonProps extends /* @vue-ignore */ Omit<ButtonProps, 'label'> {
  /** What the button does ("Next track", `Pause ${title}`…): accessible name and tooltip text. */
  label: string
}

defineOptions({ inheritAttrs: false })
defineProps<IconButtonProps>()
</script>

<template>
  <UTooltip
    :text="label"
    :content="{ side: 'top' }"
  >
    <UButton
      v-bind="$attrs"
      :aria-label="label"
    />
  </UTooltip>
</template>
