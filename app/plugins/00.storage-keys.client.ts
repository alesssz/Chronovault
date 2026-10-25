import { migrateLegacyKeys } from '~/lib/storage-keys'

/**
 * Moves what this browser saved under the app's former name (`chronoplayer:`
 * keys) to the current names (`chronovault:`), see app/lib/storage-keys.ts.
 *
 * `00.`: Nuxt runs the app's plugins in file-name order and all of them
 * before the app is mounted, so this runs before anything reads a key (the
 * player store is first created by the layouts and the later plugins).
 * `.client`: browser only. With storage blocked (private browsing) there is
 * nothing to move.
 */
export default defineNuxtPlugin(() => {
  try {
    migrateLegacyKeys(localStorage)
  }
  catch {
    // Storage blocked or unavailable: nothing was saved under the old names either.
  }
})
