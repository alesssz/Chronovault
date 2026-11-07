<script setup lang="ts">
import type { SyncedLyricLine } from '~~/shared/types/track'
import { findActiveLineIndex, isSectionHeader } from '~~/shared/utils/lyrics'

/**
 * Shows the lyrics: synced (active line highlighted, auto-scroll, click to
 * seek) or plain text. Both keep the section headers ([Intro], [Verse 1]…).
 *
 * It scrolls inside its own box, which takes the height its parent gives
 * it (`h-full`): the parent must have a definite height, or the box grows
 * with the text and has nothing to scroll. Auto-scroll moves that box only,
 * never the page around it: on the share pages the box sits in the page's
 * flow, and a visitor scrolling up to the track list or the vote buttons
 * must not be pulled back to the lyrics at every new line.
 *
 * `size="large"`: one step bigger, for the phones' lyrics view of the
 * full-screen player, where the lyrics have the whole screen to themselves.
 *
 * `shared`: on a share page's full-screen view, a track without lyrics shows
 * "No lyrics" alone: the hint to add some is for the owner, who alone can.
 */
const props = withDefaults(defineProps<{
  synced: SyncedLyricLine[] | null
  plain: string | null
  currentTime: number
  /** Text size: 'default' (beside the cover) or 'large' (lyrics on their own). */
  size?: 'default' | 'large'
  /** Shown to a share page's visitor: no hint to add lyrics, which only the owner can do. */
  shared?: boolean
  /** Every line centred (the track page's wide panel, where left-aligned lines left its right half empty). */
  centered?: boolean
  /**
   * Room after the last synced line (45vh), so the last lines also scroll up
   * to the middle while they are sung. Made for boxes nearly as tall as the
   * screen (full-screen view, phones' lyrics view); the track page's panel,
   * shorter, turns it off: there it was some 330px of nothing after the last
   * line, and the last lines simply stop lower as the scroll ends.
   */
  endRoom?: boolean
}>(), { size: 'default', shared: false, centered: false, endRoom: true })

// A line was clicked: jump to its time.
const emit = defineEmits<{ seek: [seconds: number] }>()

/** The scrolling box. */
const container = ref<HTMLElement | null>(null)
/**
 * The list of synced lines: the active one is found by its place in it, to
 * scroll it into view. Not v-for refs: Vue does not keep that array in list
 * order, and when another track's lyrics replaced these (the full-screen
 * player moving on) it held their lines in reverse, so the box scrolled to
 * the mirror line of the one sung.
 */
const listEl = ref<HTMLOListElement | null>(null)

/** Synced lyrics win over plain lyrics when both exist. */
const hasSynced = computed(() => !!props.synced?.length)
/** Line currently sung (-1 before the first one). */
const activeIndex = computed(() => (hasSynced.value ? findActiveLineIndex(props.synced!, props.currentTime) : -1))

/**
 * A synced line's colour: the one sung stands out, those sung before are
 * muted, those to come dimmed. Dimmed only on the dark theme: on the light
 * one it is pale grey on near-white, below what text needs, so the lines to
 * come are muted there. Before the first line (a share page before Play, an
 * intro) every line is readable text: all dimmed, a visitor reading the
 * lyrics got the whole of them in pale grey.
 */
function lineClass(i: number): string {
  if (i === activeIndex.value) return 'text-highlighted'
  if (activeIndex.value < 0) return 'text-toned hover:text-highlighted'
  if (i < activeIndex.value) return 'text-muted'
  return 'text-muted hover:text-toned dark:text-dimmed dark:hover:text-muted'
}

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
  // The active line (its <li>, at the same place as in `synced`) and the box it scrolls in.
  const line = listEl.value?.children[index] as HTMLElement | undefined
  const box = container.value
  if (!line || !box) return
  // The box's own scroll only: scrollIntoView would also scroll every scrollable ancestor, the
  // page included. Where the line sits inside the box's content, minus half the box's height.
  const offset = line.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop
  box.scrollTo({ top: offset - (box.clientHeight - line.clientHeight) / 2, behavior: 'smooth' })
})
</script>

<template>
  <div
    ref="container"
    class="h-full overflow-y-auto overscroll-contain"
    :class="{ 'text-center': centered }"
    @wheel.passive="onUserScroll"
    @touchmove.passive="onUserScroll"
  >
    <!--
      Lyrics start at the top; the bottom padding only lets the last lines
      scroll up to the middle while they play (see `endRoom`).
    -->
    <ol
      v-if="hasSynced"
      ref="listEl"
      class="space-y-3 pt-2 font-semibold leading-snug"
      :class="[size === 'large' ? 'text-2xl sm:text-3xl' : 'text-xl sm:text-2xl', endRoom ? 'pb-[45vh]' : 'pb-4']"
      data-testid="lyrics-synced"
    >
      <li
        v-for="(line, i) in synced!"
        :key="`${line.time}-${i}`"
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
          class="cursor-pointer transition-colors duration-300"
          :class="[centered ? 'text-center' : 'text-left', lineClass(i)]"
          :aria-current="i === activeIndex ? 'true' : undefined"
          @click="emit('seek', line.time)"
        >
          {{ line.text || '♪' }}
        </button>
      </li>
    </ol>

    <!-- Not synced: the plain text, section headers as titles -->
    <div
      v-else-if="plain"
      class="space-y-1 py-4 leading-relaxed"
      :class="size === 'large' ? 'text-xl' : 'text-lg'"
    >
      <p
        v-for="(line, i) in plainLines"
        :key="i"
        :class="line.section ? 'pt-4 text-sm font-semibold uppercase tracking-wide text-primary' : 'min-h-[1lh] text-default'"
      >
        {{ line.section ? line.text.trim().slice(1, -1) : line.text }}
      </p>
    </div>

    <!-- No lyrics at all (the hint to add some is for the owner only) -->
    <UEmpty
      v-else
      icon="i-lucide-mic-off"
      title="No lyrics"
      :description="shared ? undefined : 'Add lyrics from the track\'s edit page.'"
      class="h-full"
    />
  </div>
</template>
