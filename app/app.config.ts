/**
 * Nuxt UI theme: the Chronovault colours. Gold as the primary colour (buttons,
 * links, the current track), spectral blue as the secondary one (the played
 * part of the waveform, like the strings of the logo), night blue for the
 * neutrals (backgrounds, borders, text).
 *
 * The three scales are defined in app/assets/css/main.css (`--color-gold-*`,
 * `--color-spectral-*`, `--color-night-*`), which also picks the step of each
 * scale the light and dark themes use.
 */
export default defineAppConfig({
  ui: {
    colors: {
      primary: 'gold',
      secondary: 'spectral',
      neutral: 'night',
    },
  },
})
