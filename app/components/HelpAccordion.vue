<script setup lang="ts">
/**
 * A help panel, closed until its title is clicked: a bordered box holding one
 * Nuxt UI accordion item, its content in the default slot. The import page
 * stacks two (what each column takes, and the genres and subgenres): one
 * component keeps them alike.
 *
 * The content stays in the page while closed (`unmount-on-hide` off): the
 * genre list's search keeps its text when the panel is closed and opened
 * again, and tests can read what the panel holds without opening it.
 */
defineProps<{
  /** The panel's title, on the button that opens it. */
  label: string
}>()
</script>

<template>
  <UAccordion
    :items="[{ label, slot: 'help' }]"
    :unmount-on-hide="false"
    class="rounded-lg border border-default px-4"
    :ui="{ trigger: 'py-2.5 text-sm', body: 'pt-0 pb-3 text-sm' }"
  >
    <template #help-body>
      <slot />
    </template>
  </UAccordion>
</template>
