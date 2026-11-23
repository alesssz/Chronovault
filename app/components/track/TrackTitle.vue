<script setup lang="ts">
/**
 * A title on one line that, when too long, loses its middle rather than its
 * end: "The Silver Mask of Hi… 2", "The Marble and the… (Cover)". Versions of
 * a song differ only at the end (splitTitleEnd), so in a narrow list they stay
 * told apart; a title that fits shows whole. Font, weight and colour come from
 * the parent, which also sets the width (this fills it).
 */
import { splitTitleEnd } from '~/lib/track-title'

const props = defineProps<{ title: string | null | undefined }>()

const parts = computed(() => splitTitleEnd(props.title ?? ''))
</script>

<template>
  <span
    v-if="parts.head"
    class="flex min-w-0"
  >
    <span class="truncate">{{ parts.head }}</span>
    <!--
      The space leads the end, kept by `whitespace-pre`: at the end of the head it would be
      dropped as the end of a line. The cap only bites on an end longer than most of the line
      (one very long word), which then truncates too instead of hiding the head.
    -->
    <span class="max-w-[60%] shrink-0 overflow-hidden text-ellipsis whitespace-pre">{{ ` ${parts.end}` }}</span>
  </span>
  <span
    v-else
    class="block truncate"
  >{{ parts.end }}</span>
</template>
