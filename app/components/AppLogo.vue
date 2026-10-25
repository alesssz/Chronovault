<script setup lang="ts">
/**
 * The Chronovault logo: the mark (AppMark, the portal with the strings) and
 * the name in Cinzel capitals, "CHRONO" in the text colour and "VAULT" in
 * gold, as on the artwork. Optionally the tagline underneath.
 *
 * Inherits the font size of its parent: the mark is sized in `em`, so
 * `class="text-2xl"` scales the whole logo.
 * - `compact`: on narrow screens only the mark is shown (the app header,
 *   where the section links need the room);
 * - `tagline`: "The Sound of Time Remembering Itself" under the name, from
 *   `sm` up (the sign-in page, the share pages' header).
 *
 * The name is written "Chronovault" and set in capitals by CSS, so screen
 * readers read the word, not the letters.
 */
import { APP_NAME_PARTS, APP_TAGLINE } from '~~/shared/brand'

defineProps<{ compact?: boolean, tagline?: boolean }>()

/** "Chrono" and "vault": the two colours of the name. */
const [first, second] = APP_NAME_PARTS
</script>

<template>
  <span class="inline-flex items-center gap-2">
    <AppMark class="size-[1.75em] shrink-0" />
    <span
      class="flex min-w-0 flex-col"
      :class="{ 'hidden sm:flex': compact }"
    >
      <!-- The name: "Chrono" + "vault", split for the two colours (one word for screen readers) -->
      <span class="font-display text-[1.05em] leading-none font-bold tracking-[0.06em] text-highlighted uppercase">
        {{ first }}<span class="text-primary">{{ second }}</span>
      </span>
      <!-- The tagline, small and spaced out, where there is room for it -->
      <span
        v-if="tagline"
        class="mt-1 hidden font-display text-[0.5em] leading-tight font-semibold tracking-[0.13em] text-muted uppercase sm:block"
      >
        {{ APP_TAGLINE }}
      </span>
    </span>
  </span>
</template>
