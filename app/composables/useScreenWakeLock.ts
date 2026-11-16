import type { MaybeRefOrGetter } from 'vue'

/**
 * Keeps the screen on while `active` is true, for views the user listens to
 * without touching the phone, which would otherwise dim and lock after its
 * usual timeout. VueUse's useWakeLock asks for the lock again when the page
 * returns to the foreground (the browser drops it while hidden) and releases
 * it when the component unmounts.
 */
export function useScreenWakeLock(active: MaybeRefOrGetter<boolean>) {
  const wakeLock = useWakeLock()
  watch(() => toValue(active), (on) => {
    if (!wakeLock.isSupported.value) return
    // A refusal (e.g. battery saver) only means the screen behaves as usual.
    if (on) wakeLock.request('screen').catch(() => {})
    else wakeLock.release().catch(() => {})
  }, { immediate: true })
}
