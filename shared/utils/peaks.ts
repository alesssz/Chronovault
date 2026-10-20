/** Number of waveform samples stored in the database. */
export const PEAKS_RESOLUTION = 1000

/**
 * Reduces audio channels to `buckets` amplitude values (0..1) for the waveform.
 * For each interval it takes the absolute peak across all channels, then
 * normalizes against the highest peak and rounds to 3 decimals (compact JSON).
 */
export function computePeaks(channels: ArrayLike<number>[], buckets = PEAKS_RESOLUTION): number[] {
  const length = channels.reduce((max, ch) => Math.max(max, ch.length), 0)
  if (length === 0 || buckets <= 0) return []

  const count = Math.min(buckets, length)
  const size = length / count
  const peaks = Array.from<number>({ length: count }).fill(0)

  for (let b = 0; b < count; b++) {
    const start = Math.floor(b * size)
    const end = Math.max(start + 1, Math.floor((b + 1) * size))
    let peak = 0
    for (const channel of channels) {
      for (let i = start; i < end && i < channel.length; i++) {
        const v = Math.abs(channel[i]!)
        if (v > peak) peak = v
      }
    }
    peaks[b] = peak
  }

  const max = Math.max(...peaks)
  if (max === 0) return peaks
  return peaks.map(p => Math.round((p / max) * 1000) / 1000)
}
