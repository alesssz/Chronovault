/**
 * The Chronovault brand: the name, the tagline, the colours that live outside
 * the CSS, the fallback cover and the geometry of the mark.
 *
 * One source for every place that draws or names the app:
 * - the app itself: the logo (app/components/AppMark.vue, AppLogo.vue), page
 *   titles (usePageTitle), link previews (useShareMeta), the lock-screen card
 *   (app/lib/media-session.ts), the tags written into downloaded files;
 * - nuxt.config.ts: the browser theme colour and the PWA manifest;
 * - scripts/generate-brand.mjs: the favicon, the PWA icons and the fallback
 *   cover in public/ (Node imports this file directly: it uses only type
 *   syntax Node can strip, no enums or namespaces).
 *
 * The interface colours (the gold, spectral and night scales Nuxt UI reads)
 * are in app/assets/css/main.css; BRAND_COLORS repeats the few of them that
 * code needs as plain values.
 *
 * The mark comes in two variants, drawn on the same 100×100 grid:
 * - `full` (the logo): the portal, a gold ring with twelve ticks like a dial,
 *   crossed by three guitar strings, the middle one vibrating. Used wherever
 *   it has room: the header, the PWA icons.
 * - `small`: the same ring crossed by a single sound wave. Used where the three
 *   strings would blur together: the browser tab (16 and 32 px).
 * Only the stroke positions are fixed here; each place paints them with its
 * own colours (gold ring, spectral wave, a halo in the background colour).
 */

/**
 * The name's two halves, for the logo, which colours them apart ("CHRONO" in
 * the text colour, "VAULT" in gold, as on the artwork).
 */
export const APP_NAME_PARTS = ['Chrono', 'vault'] as const

/** The app's name, as people see it: header, page titles, PWA, link previews. */
export const APP_NAME = APP_NAME_PARTS.join('')

/** The line under the name, from the Chronovault artist page. */
export const APP_TAGLINE = 'The Sound of Time Remembering Itself'

/**
 * Brand colours needed as plain values (the browser theme colour, the PWA
 * manifest, the generated icons). The same values are in the CSS scales
 * (main.css): night = night-900, gold = gold-400, spectral = spectral-400.
 */
export const BRAND_COLORS = {
  /** The night blue behind everything: the dark theme's background. */
  night: '#0b1024',
  /** The gold of the ring and of the name. */
  gold: '#d6a84e',
  /** The spectral blue of the strings and the wave. */
  spectral: '#66d6ff',
  /** Top and bottom of the icon tile's vertical gradient (a lighter night above). */
  tileTop: '#18224a',
  tileBottom: '#080c1c',
} as const

/**
 * The glow inside the portal, from its centre outwards: the galaxy core of the
 * Chronovault artwork, fading into the night. Drawn on dark backgrounds only.
 */
export const MARK_CORE_STOPS: readonly { offset: string, color: string, opacity: number }[] = [
  { offset: '0%', color: '#c9b6ff', opacity: 0.95 },
  { offset: '35%', color: '#6a4fd8', opacity: 0.65 },
  { offset: '100%', color: BRAND_COLORS.night, opacity: 0 },
]

/** The circle the glow fills: just inside the ring. */
export const MARK_CORE = { cx: 50, cy: 50, r: 24 } as const

/**
 * The cover shown for a track or playlist without one: the Chronovault artwork,
 * generated from brand/chronovault.jpg (scripts/generate-brand.mjs).
 * - `app`: in the app and on the lock screen (WebP, like the uploaded covers);
 * - `preview`: in link previews (JPEG: not every chat app reads WebP).
 */
export const FALLBACK_COVER = {
  app: '/cover-fallback.webp',
  preview: '/cover-fallback.jpg',
  /** Width and height of both, in pixels (a square, like the covers). */
  size: 800,
} as const

/** The two drawings of the mark: `full` where there is room, `small` at favicon sizes. */
export type MarkVariant = 'full' | 'small'

/**
 * What a stroke is painted with:
 * - `ring`: the gold (the ring and its ticks);
 * - `wave`: the spectral blue (the strings, the wave);
 * - `halo`: the background colour, drawn wider under a wave stroke so it cuts
 *   a gap in the ring where the wave crosses it, and the two stay apart even
 *   at 16 px.
 */
export type MarkPaint = 'ring' | 'wave' | 'halo'

/** One stroke of the mark: an SVG path on the 100×100 grid, its paint and its width. */
export interface MarkStroke {
  /** The SVG path data, on the mark's 100×100 grid. */
  d: string
  /** What it is painted with (see MarkPaint). */
  paint: MarkPaint
  /** Stroke width, in grid units. */
  width: number
}

/** The ring (radius 30, as a path: two half circles) and the twelve ticks around it. */
const PORTAL: readonly MarkStroke[] = [
  { d: 'M50 20a30 30 0 1 0 0 60a30 30 0 1 0 0-60', paint: 'ring', width: 5 },
  // The four main ticks (12, 3, 6 and 9 o'clock), longer and thicker.
  { d: 'M50 9v7M50 84v7M9 50h7M84 50h7', paint: 'ring', width: 3.4 },
  // The eight others.
  { d: 'M70.5 14.5l-2 3.4M85.5 29.5l-3.4 2M85.5 70.5l-3.4-2M70.5 85.5l-2-3.4M29.5 85.5l2-3.4M14.5 70.5l3.4-2M14.5 29.5l3.4 2M29.5 14.5l2 3.4', paint: 'ring', width: 2.6 },
]

/** `small`: a sound wave across the portal, growing towards the centre. */
const SMALL_WAVE = 'M8 50H17Q20 46 23 50Q26 56 29 50Q32 40 35 50Q38 66 41 50Q44 28 47 50Q50 78 53 50Q56 28 59 50Q62 66 65 50Q68 40 71 50Q74 56 77 50Q80 46 83 50H92'

/** `full`: the two outer strings, straight. */
const OUTER_STRINGS = 'M8 36H92M8 64H92'

/** `full`: the middle string, vibrating within the portal. */
const MIDDLE_STRING = 'M8 50H24Q27 46 30 50Q33 56 36 50Q39 40 42 50Q45 64 48 50Q51 34 54 50Q57 64 60 50Q63 40 66 50Q69 56 72 50Q75 46 78 50H92'

/**
 * The strokes of each variant, in drawing order: the portal first, then the
 * halos, then the waves over them.
 */
export const MARK_STROKES: Record<MarkVariant, readonly MarkStroke[]> = {
  full: [
    ...PORTAL,
    { d: OUTER_STRINGS, paint: 'halo', width: 7 },
    { d: MIDDLE_STRING, paint: 'halo', width: 9 },
    { d: OUTER_STRINGS, paint: 'wave', width: 2.6 },
    { d: MIDDLE_STRING, paint: 'wave', width: 3.8 },
  ],
  small: [
    ...PORTAL,
    { d: SMALL_WAVE, paint: 'halo', width: 10 },
    { d: SMALL_WAVE, paint: 'wave', width: 4.6 },
  ],
}
