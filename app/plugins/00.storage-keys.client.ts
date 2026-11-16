import { migrateLegacyKeys } from '~/lib/storage-keys'

/**
 * Moves what this browser saved under the app's former name (`chronoplayer:`
 * keys) to the current names (`chronovault:`).
 *
 * The `00.` prefix runs it before the other plugins, and every plugin runs
 * before the app mounts, so the keys are moved before anything reads one
 * (the player store is first created by the layouts and the later plugins).
 */
export default defineNuxtPlugin(() => {
  try {
    migrateLegacyKeys(localStorage)
  }
  catch {
    // Storage blocked or unavailable: nothing was saved under the old names either.
  }
})
