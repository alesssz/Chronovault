<script setup lang="ts">
import type { SyncedLyricLine } from '~~/shared/types/track'
import { findActiveLineIndex, isSectionHeader } from '~~/shared/utils/lyrics'

/**
 * Shows the lyrics: synced (active line highlighted, auto-scroll, click to
 * seek) or plain text. Both keep the section headers ([Intro], [Verse 1]…).
 */
const props = defineProps<{
  synced: SyncedLyricLine[] | null
  plain: string | null
  currentTime: number
}>()

const emit = defineEmits<{ seek: [seconds: number] }>()

/** The scrolling box. */
const container = ref<HTMLElement | null>(null)
/** One element per synced line (v-for refs), to scroll the active one into view. */
const lineRefs = ref<HTMLElement[]>([])

/** Synced lyrics win over plain lyrics when both exist. */
const hasSynced = computed(() => !!props.synced?.length)
/** Line currently sung (-1 before the first one). */
const activeIndex = computed(() => (hasSynced.value ? findActiveLineIndex(props.synced!, props.currentTime) : -1))

/** Plain lyrics split in lines, with [Section] lines marked as headers. */
const plainLines = computed(() =>
  (props.plain ?? '').split(/\r?\n/).map(text => ({
    text,
    section: isSectionHeader(text),
  })),
)

// When the user scrolls manually, auto-scroll pauses for a few seconds.
const userScrolledAt = ref(0)
/** Auto-scroll pauses this long (ms) after the user scrolls by hand. */
const AUTO_SCROLL_PAUSE = 4000

/** Wheel or touch scrolling: remember when, to pause auto-scroll. */
function onUserScroll() {
  userScrolledAt.value = Date.now()
}

// Keep the active line in the middle of the box (unless the user is scrolling).
watch(activeIndex, (index) => {
  if (index < 0 || Date.now() - userScrolledAt.value < AUTO_SCROLL_PAUSE) return
  lineRefs.value[index]?.scrollIntoView({ block: 'center', behavior: 'smooth' })
})
</script>

<template>
  <div
    ref="container"
    class="h-full overflow-y-auto overscroll-contain"
    @wheel.passive="onUserScroll"
    @touchmove.passive="onUserScroll"
  >
    <!--
      Lyrics start at the top; the bottom padding only lets the last lines
      scroll up to the middle while they play.
    -->
    <ol
      v-if="hasSynced"
      class="space-y-3 pt-2 pb-[45vh] text-xl font-semibold leading-snug sm:text-2xl"
      data-testid="lyrics-synced"
    >
      <li
        v-for="(line, i) in synced!"
        :key="`${line.time}-${i}`"
        ref="lineRefs"
        :class="{ 'pt-6 first:pt-0': line.section }"
      >
        <p
          v-if="line.section"
          class="text-sm font-semibold uppercase tracking-widest text-primary"
          data-testid="lyrics-section"
        >
          {{ line.text.trim().slice(1, -1) }}
        </p>
        <button
          v-else
          type="button"
          class="cursor-pointer text-left transition-colors duration-300"
          :class="i === activeIndex
            ? 'text-highlighted'
            : i < activeIndex ? 'text-muted' : 'text-dimmed hover:text-muted'"
          :aria-current="i === activeIndex ? 'true' : undefined"
          @click="emit('seek', line.time)"
        >
          {{ line.text || '♪' }}
        </button>
      </li>
    </ol>

    <div
      v-else-if="plain"
      class="space-y-1 py-4 text-lg leading-relaxed"
    >
      <p
        v-for="(line, i) in plainLines"
        :key="i"
        :class="line.section ? 'pt-4 text-sm font-semibold uppercase tracking-wide text-primary' : 'min-h-[1lh] text-default'"
      >
        {{ line.section ? line.text.trim().slice(1, -1) : line.text }}
      </p>
    </div>

    <UEmpty
      v-else
      icon="i-lucide-mic-off"
      title="No lyrics"
      description="Add lyrics from the track's edit page."
      class="h-full"
    />
  </div>
</template>
