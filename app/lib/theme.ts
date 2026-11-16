/**
 * Resolved value of a Nuxt UI theme variable (e.g. `--ui-primary`), for code
 * that draws outside the CSS cascade: canvas waveforms, shadow DOM.
 * Browser only (reads computed styles): call it from onMounted or later.
 */
export function themeColor(variable: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim()
  return value || fallback
}

/**
 * Colors of every waveform (player, public pages, sync editor), read from
 * the current theme: rebuild the waveform after a light/dark switch.
 * The played part is spectral blue (the secondary colour), like the strings
 * of the logo; the fallbacks are the dark theme's values.
 */
export function waveformColors(): { waveColor: string, progressColor: string, cursorColor: string } {
  return {
    waveColor: themeColor('--ui-border-accented', '#323b5c'),
    progressColor: themeColor('--ui-secondary', '#66d6ff'),
    cursorColor: themeColor('--ui-text-highlighted', '#ffffff'),
  }
}
