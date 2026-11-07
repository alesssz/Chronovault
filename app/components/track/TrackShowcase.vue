<script setup lang="ts">
import { FALLBACK_COVER } from '~~/shared/brand'

/**
 * A track laid out for listening: the share page's body (pages/t/[id].vue)
 * and the full-screen player's from `md` (PlayerExpanded). One component, so
 * the two never drift apart: the same track looked one way in the library's
 * full-screen view and another on its link.
 *
 * From `md`:
 *   - a band on top, centred, in two lines: the title with "WIP" beside it
 *     for a draft, then a quieter byline, composers · album · year · genre
 *     (each cut with an ellipsis, whole in its tooltip);
 *   - two columns under it, 2 : 3. Left: the cover, a square as wide as the
 *     column, and the description (About) under it. Right: the lyrics panel,
 *     exactly as tall as the left column, from the cover's top edge to About's
 *     end (sized out of the row with `contain: size`, so long lyrics never make
 *     it taller: they scroll inside). Without lyrics, the description takes
 *     their place, as tall; with neither, one narrower centred column.
 * Below `md` one column in reading order: cover, title, the `player` slot
 * (the share page's in-page player and Download), lyrics, About. The left
 * section is `contents` there, so its children are the grid's and `order`
 * sets it.
 *
 * The cover is a button that opens it full screen (CoverViewer), the
 * Chronovault artwork too for a track without one.
 *
 * What changes between the two places comes in through slots: `lyrics` (the
 * share page's ShareLyrics, which reads the player's position itself so the
 * page does not render again every frame; the full-screen view's LyricsView)
 * and `player`. `testid` prefixes the marks the tests look for: `shared` on the
 * share page, `player` in the full-screen view, so both can be on screen at
 * once without the same mark twice.
 */
const props = defineProps<{
  /** The track's title. */
  title: string
  /** Who wrote it, or none. */
  composers: string | null
  /** "Album · Year · Genre", the parts that are set ('' for none). */
  meta: string
  /** A draft: "Work in progress" (below `md`) or "WIP" (in the band). */
  draft: boolean
  /** The cover's address, or none (the Chronovault artwork then). */
  coverUrl: string | null
  /** The description (About), or none. */
  description: string | null
  /** The track has lyrics: the `lyrics` slot fills the right panel. */
  hasLyrics: boolean
  /** Prefix of the test marks: `shared` (share page) or `player` (full-screen view). */
  testid: 'shared' | 'player'
}>()

const slots = defineSlots<{
  /** The lyrics, in the panel. */
  lyrics?: () => unknown
  /** Below `md`, between the title and the lyrics: an in-page player. */
  player?: () => unknown
}>()

/** Two columns from `md`: the lyrics, or else the description, beside the cover. */
const twoColumns = computed(() => props.hasLyrics || !!props.description)
/** The cover is open full screen. */
const coverOpen = ref(false)
</script>

<template>
  <div
    class="mx-auto grid grid-cols-[minmax(0,1fr)] gap-6 md:gap-x-12 md:gap-y-4"
    :class="twoColumns ? 'md:max-w-6xl md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]' : 'max-w-md'"
    :data-testid="`${testid}-track`"
  >
    <!--
      The title's block. Below `md`: a draft's "Work in progress" badge, the title, composers, then
      album · year · genre, under the cover. From `md` the band over both columns, centred, in two
      lines: the title with a draft's "WIP" beside it, then a quieter byline, composers · album ·
      year · genre. (On one line with the byline, the title read as one more piece of data.)
      `col-span-full`, not `col-span-2`: over a single column, a span of two added an empty
      implicit column and pushed the column 30px off centre.
    -->
    <div class="order-2 min-w-0 md:order-first md:col-span-full md:flex md:flex-wrap md:items-center md:justify-center md:gap-x-3 md:gap-y-1">
      <!-- A draft is one version among others: friends know it is not the final cut -->
      <UBadge
        v-if="draft"
        icon="i-lucide-flask-conical"
        color="warning"
        variant="subtle"
        title="Work in progress"
        class="mb-2 md:order-2 md:mb-0 md:shrink-0"
        :data-testid="`${testid}-wip`"
      >
        <!-- "WIP" beside the title in the band (as on a playlist's rows) -->
        <span class="md:hidden">Work in progress</span>
        <span class="max-md:hidden">WIP</span>
      </UBadge>
      <h1
        class="text-3xl font-bold tracking-tight text-balance md:order-1 md:max-w-[calc(100%-6rem)] md:min-w-0 md:truncate"
        :title="title"
        :data-testid="`${testid}-title`"
      >
        {{ title }}
      </h1>
      <!--
        Composers and album · year · genre: two lines below `md`; in the band one byline of its own
        under the title (`basis-full` starts the new line), centred, each part cut with an ellipsis.
      -->
      <div
        v-if="composers || meta"
        class="min-w-0 md:order-3 md:flex md:basis-full md:items-baseline md:justify-center md:gap-2"
      >
        <p
          v-if="composers"
          class="mt-1 text-lg text-muted md:mt-0 md:max-w-[50%] md:shrink-0 md:truncate md:text-base"
          :title="composers"
        >
          {{ composers }}
        </p>
        <span
          v-if="composers && meta"
          class="text-dimmed max-md:hidden"
          aria-hidden="true"
        >·</span>
        <p
          v-if="meta"
          class="mt-1 text-sm text-dimmed md:mt-0 md:min-w-0 md:truncate md:text-base"
          :title="meta"
        >
          {{ meta }}
        </p>
      </div>
    </div>

    <!-- Left (from `md`): cover, About -->
    <section class="max-md:contents md:flex md:min-w-0 md:flex-col md:gap-4">
      <!--
        The cover. Below `md` it shrinks with the screen's height, so the share page's play button
        is in the first screen even on a short phone (375×667) with the browser's bars (26rem:
        header, title lines, the waveform and the row of controls under it).
      -->
      <button
        type="button"
        aria-label="Open the cover full screen"
        class="order-1 mx-auto block w-full max-w-[max(10rem,min(24rem,calc(100dvh-26rem)))] cursor-zoom-in rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary md:mx-0 md:max-w-none"
        :data-testid="`${testid}-cover`"
        @click="coverOpen = true"
      >
        <TrackCover
          :url="coverUrl"
          :title="title"
          rounded="rounded-xl"
          class="w-full shadow-2xl shadow-black/40"
        />
      </button>
      <CoverViewer
        v-model:open="coverOpen"
        :url="coverUrl || FALLBACK_COVER.app"
        :title="title"
      />

      <!-- About: under the cover from `md` (the lyrics beside it), after the lyrics below it -->
      <div
        v-if="hasLyrics && description"
        class="order-5 space-y-2 md:pt-2"
      >
        <h2 class="text-xs font-semibold uppercase tracking-widest text-muted">
          About
        </h2>
        <p
          class="whitespace-pre-line leading-relaxed"
          :data-testid="`${testid}-description`"
        >
          {{ description }}
        </p>
      </div>
    </section>

    <!-- Below `md`: the page's own player (the share page's), between the title and the lyrics -->
    <div
      v-if="slots.player"
      class="order-3 flex flex-col gap-6 md:hidden"
    >
      <slot name="player" />
    </div>

    <!--
      The lyrics. From `md` the right column, as tall as the left one (cover and About): sized out
      of the row (`contain: size`) and stretched to it, the lines scrolling inside.
    -->
    <section
      v-if="hasLyrics"
      class="order-4 h-[70dvh] min-w-0 rounded-xl border border-default bg-elevated/30 px-4 sm:px-6 md:h-auto md:min-h-0 md:[contain:size]"
      aria-label="Lyrics"
      :data-testid="`${testid}-lyrics`"
    >
      <slot name="lyrics" />
    </section>

    <!-- Without lyrics, About takes their place: the right column from `md`, as tall as the cover -->
    <section
      v-else-if="description"
      class="order-5 min-w-0 space-y-2 overflow-y-auto md:min-h-0 md:rounded-xl md:border md:border-default md:bg-elevated/30 md:p-6 md:[contain:size]"
      aria-label="About"
      :data-testid="`${testid}-about`"
    >
      <h2 class="text-xs font-semibold uppercase tracking-widest text-muted">
        About
      </h2>
      <p
        class="whitespace-pre-line leading-relaxed"
        :data-testid="`${testid}-description`"
      >
        {{ description }}
      </p>
    </section>
  </div>
</template>
