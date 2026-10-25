<script setup lang="ts">
/**
 * The Chronovault mark, drawn inline from its geometry in shared/brand.ts
 * (the same strokes as the favicon and the PWA icons, which
 * scripts/generate-brand.mjs draws on a night-blue tile).
 *
 * Here it has no tile: it sits on the page and takes the theme's colours:
 * the ring in the primary gold, the strings in the secondary spectral blue,
 * the halos (the gaps where a string crosses the ring) in the page's
 * background colour. The glow inside the portal shows on the dark theme only;
 * on a light background it would read as a stain.
 *
 * The size comes from the parent (class). Decorative: the name next to it
 * (AppLogo) or the link around it says what it is.
 *
 * `variant`: `full` (three strings, the default) or `small` (one wave, for
 * very small sizes).
 */
import { MARK_CORE, MARK_CORE_STOPS, MARK_STROKES, type MarkPaint, type MarkVariant } from '~~/shared/brand'

// Which drawing: `full` unless the parent asks for `small`.
const props = withDefaults(defineProps<{ variant?: MarkVariant }>(), { variant: 'full' })

/** The strokes of the chosen variant, in drawing order. */
const strokes = computed(() => MARK_STROKES[props.variant])

/** The theme colour each role is painted with (Nuxt UI variables, so they follow light and dark). */
const PAINT: Record<MarkPaint, string> = {
  ring: 'var(--ui-primary)',
  wave: 'var(--ui-secondary)',
  halo: 'var(--ui-bg)',
}

/** A page-unique id for the glow's gradient: two marks on a page must not share it. */
const coreId = useId()
</script>

<template>
  <svg
    viewBox="0 0 100 100"
    aria-hidden="true"
    focusable="false"
  >
    <defs>
      <!-- The glow inside the portal: the galaxy core of the artwork -->
      <radialGradient :id="coreId">
        <stop
          v-for="stop in MARK_CORE_STOPS"
          :key="stop.offset"
          :offset="stop.offset"
          :stop-color="stop.color"
          :stop-opacity="stop.opacity"
        />
      </radialGradient>
    </defs>
    <!-- The glow, on the dark theme only -->
    <circle
      :cx="MARK_CORE.cx"
      :cy="MARK_CORE.cy"
      :r="MARK_CORE.r"
      :fill="`url(#${coreId})`"
      class="hidden dark:inline"
    />
    <!-- The ring, its ticks, then the halos and the strings over them -->
    <g
      fill="none"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path
        v-for="(stroke, i) in strokes"
        :key="i"
        :d="stroke.d"
        :stroke="PAINT[stroke.paint]"
        :stroke-width="stroke.width"
      />
    </g>
  </svg>
</template>
