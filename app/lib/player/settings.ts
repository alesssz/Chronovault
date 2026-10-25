/**
 * Player settings remembered across visits on this device (localStorage):
 * the volume, shuffle and repeat. Everything is best effort: with storage
 * blocked (private browsing, server rendering) the defaults apply and
 * changes are simply not remembered.
 *
 * The play queue itself is saved elsewhere (app/lib/queue-storage.ts),
 * because it belongs to a signed-in user while these settings belong to the
 * device.
 */
import { clamp } from '~~/shared/utils/numbers'
import { STORAGE_KEYS } from '~/lib/storage-keys'
import type { RepeatMode } from './types'

/** localStorage key of the volume, remembered across visits like shuffle and repeat. */
const VOLUME_KEY = STORAGE_KEYS.volume
/** localStorage key of shuffle and repeat (remembered like the volume). */
const MODES_KEY = STORAGE_KEYS.playbackModes

/** Repeat modes in the order the button cycles through them. */
export const REPEAT_MODES: readonly RepeatMode[] = ['off', 'all', 'one']

/** Shuffle and repeat, as saved together. */
export interface PlaybackModes {
  /** Shuffle is on. */
  shuffle: boolean
  /** Repeat mode: off, the whole queue, or the current track. */
  repeat: RepeatMode
}

/** Volume saved by the previous visit (1 when absent, invalid or storage is blocked). */
export function readStoredVolume(): number {
  try {
    // The saved text, or nothing (null: never saved; undefined: no storage).
    const raw = globalThis.localStorage?.getItem(VOLUME_KEY)
    // As a number (NaN when missing or not a number).
    const value = raw == null ? Number.NaN : Number(raw)
    return Number.isFinite(value) ? clamp(value, 0, 1) : 1
  }
  catch {
    return 1
  }
}

/** Remembers the volume for the next visit (best effort). */
export function storeVolume(value: number): void {
  try {
    globalThis.localStorage?.setItem(VOLUME_KEY, String(value))
  }
  catch {
    // Storage unavailable (e.g. private browsing): the volume is not remembered.
  }
}

/** Shuffle and repeat saved by the previous visit (both off when absent, invalid or storage is blocked). */
export function readStoredModes(): PlaybackModes {
  try {
    // The saved JSON, or nothing.
    const raw = globalThis.localStorage?.getItem(MODES_KEY)
    // Its fields, still unchecked (anything not as expected counts as off).
    const value = (raw ? JSON.parse(raw) : {}) as { shuffle?: unknown, repeat?: unknown }
    return {
      shuffle: value.shuffle === true,
      repeat: REPEAT_MODES.find(mode => mode === value.repeat) ?? 'off',
    }
  }
  catch {
    return { shuffle: false, repeat: 'off' }
  }
}

/** Remembers shuffle and repeat for the next visit (best effort). */
export function storeModes(modes: PlaybackModes): void {
  try {
    globalThis.localStorage?.setItem(MODES_KEY, JSON.stringify(modes))
  }
  catch {
    // Storage unavailable (e.g. private browsing): the modes are not remembered.
  }
}
