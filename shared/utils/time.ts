/**
 * Formats seconds as `m:ss` (or `h:mm:ss` past one hour).
 * Invalid or negative values become `0:00`.
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

/** Remaining time with a leading minus sign, e.g. `-2:31`. */
export function formatRemaining(currentTime: number, duration: number): string {
  return `-${formatTime(Math.max(0, duration - currentTime))}`
}

/** Human-readable file size, e.g. `34.2 MB`. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const value = bytes / 1024 ** i
  return `${i === 0 ? value : value.toFixed(1)} ${units[i]}`
}
