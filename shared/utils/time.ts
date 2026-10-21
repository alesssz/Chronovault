/**
 * Display formatting for times and sizes. Auto-imported in Vue templates
 * (Nuxt auto-imports `shared/utils`), so pages can call `formatTime(…)` directly.
 */

/**
 * Formats seconds as `m:ss` (or `h:mm:ss` past one hour).
 * Invalid or negative values become `0:00`.
 * Fractions are truncated, like every music player: 59.9 s shows as `0:59`.
 */
export function formatTime(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '0:00'
  const total = Math.floor(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/** Remaining time with a leading minus sign, e.g. `-2:31` (never below `-0:00`). */
export function formatRemaining(currentTime: number, duration: number): string {
  return `-${formatTime(Math.max(0, duration - currentTime))}`
}

/**
 * How long ago an ISO timestamp was, in the largest whole unit:
 * `just now`, `5 minutes ago`, `3 hours ago`, `yesterday`, `12 days ago`.
 */
export function formatAge(iso: string, now = Date.now()): string {
  const seconds = Math.max(0, (now - Date.parse(iso)) / 1000)
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return rtf.format(-Math.floor(seconds / 60), 'minute')
  if (seconds < 86_400) return rtf.format(-Math.floor(seconds / 3600), 'hour')
  return rtf.format(-Math.floor(seconds / 86_400), 'day')
}

/** Human-readable file size in binary units, e.g. `34.2 MB`; bytes are shown without decimals. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  // Largest unit that keeps the value ≥ 1, capped at GB.
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const value = bytes / 1024 ** i
  return `${i === 0 ? value : value.toFixed(1)} ${units[i]}`
}
