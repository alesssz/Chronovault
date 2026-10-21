/**
 * Resolved value of a Nuxt UI theme variable (e.g. `--ui-primary`), for code
 * that draws outside the CSS cascade: canvas waveforms, shadow DOM.
 */
// Browser only (reads computed styles): call it from onMounted or later.
export function themeColor(variable: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim()
  return value || fallback
}
