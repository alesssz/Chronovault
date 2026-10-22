# Shuffle and repeat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shuffle (on/off) and repeat (off → all → one) for library playback, remembered on the device, as specified in `docs/superpowers/specs/2026-10-22-shuffle-repeat-design.md`.

**Architecture:** Shuffle reorders the store's `queue` array and keeps the original order (track ids) to restore it. The ordering rules are pure functions in `app/lib/queue-order.ts`; the store (`app/stores/player.ts`) applies them and the repeat rules in `next` / `previous` / `ended`; the saved queue (`app/lib/queue-storage.ts`) moves to format 2 with the original order.

**Tech Stack:** Nuxt 4, Vue 3, Pinia, Nuxt UI 4 (`UButton`, lucide icons), Vitest (unit project, Node), Playwright.

Commands (pnpm is under nvm here: prefix with `export PATH=~/.nvm/versions/node/v24.22.1/bin:$PATH`):
- one unit file: `pnpm exec vitest run --project unit <file>`
- lint: `pnpm exec eslint <files>` · types: `pnpm typecheck`
- e2e on the production build (stop nothing: run it in a worktree if a dev server is up): `pnpm exec playwright test queue`

---

## File structure

| File | Change | Responsibility |
|---|---|---|
| `app/lib/queue-order.ts` | create | Pure play-order rules: shuffle, unshuffle from the current track, random slot, new shuffled round |
| `test/unit/app/queue-order.test.ts` | create | Their unit tests, seeded random |
| `app/stores/player.ts` | modify | `shuffle`, `repeat`, `originalOrder` state; `setShuffle`, `cycleRepeat`; repeat in `next` / `previous` / `ended`; shuffle in `playTrack`, `addToQueue`, `playNext`, `restoreQueue`; modes saved like the volume |
| `test/unit/app/player-store.test.ts` | modify | Store behaviour of both modes |
| `app/lib/queue-storage.ts` | modify | Format 2 with `originalTrackIds`; version 1 still read; resolve filters the original order |
| `test/unit/app/queue-storage.test.ts` | modify | Versions 1 and 2, filtering |
| `app/plugins/queue-persistence.client.ts` | modify | Saves and restores the original order; saves on shuffle changes |
| `app/components/player/PlayerControls.vue` | modify | Shuffle and repeat buttons (`showModes` prop) |
| `app/components/player/PlayerBar.vue` | modify | Compact phone bar without the modes |
| `test/e2e/queue.spec.ts` | modify | Shuffle reorders and restores Up next; repeat one restarts the track |
| `README.md` | modify | Features table (Player), 7.5, 7.6 |

---

### Task 1: Pure play-order rules

**Files:** Create `app/lib/queue-order.ts`, `test/unit/app/queue-order.test.ts`

- [ ] **Step 1: Write the failing tests** — `test/unit/app/queue-order.test.ts`:

```ts
/**
 * Play-order rules of shuffle (app/lib/queue-order.ts), with a seeded random
 * source so every shuffle is reproducible.
 */
import { describe, expect, it } from 'vitest'
import { randomUpcomingSlot, shuffled, shuffledRound, shuffleUpcoming, unshuffleUpcoming } from '~/lib/queue-order'

/** Deterministic random numbers in [0, 1) (mulberry32). */
function seeded(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Queue items with the given ids. */
const items = (...ids: string[]) => ids.map(id => ({ id }))
/** The ids of queue items, in order. */
const ids = (queue: { id: string }[]) => queue.map(t => t.id)

describe('shuffled', () => {
  it('returns a permutation and leaves the input untouched', () => {
    const input = ['a', 'b', 'c', 'd', 'e']
    const result = shuffled(input, seeded(1))
    expect([...result].sort()).toEqual(input)
    expect(result).not.toEqual(input)
    expect(input).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('uses the random source (same seed, same order)', () => {
    expect(shuffled(['a', 'b', 'c', 'd'], seeded(7))).toEqual(shuffled(['a', 'b', 'c', 'd'], seeded(7)))
  })
})

describe('shuffleUpcoming', () => {
  it('keeps played tracks and the current one in place', () => {
    const result = ids(shuffleUpcoming(items('a', 'b', 'c', 'd', 'e', 'f'), 1, seeded(3)))
    expect(result.slice(0, 2)).toEqual(['a', 'b'])
    expect(result.slice(2).sort()).toEqual(['c', 'd', 'e', 'f'])
  })
})

describe('unshuffleUpcoming', () => {
  const original = ['a', 'b', 'c', 'd', 'e']

  it('carries on in the original order from the current track, wrapping around', () => {
    // Current: c (played: e). Upcoming, shuffled: a, d, b.
    expect(ids(unshuffleUpcoming(items('e', 'c', 'a', 'd', 'b'), 1, original))).toEqual(['e', 'c', 'd', 'a', 'b'])
  })

  it('puts tracks the original order does not know last, in their current order', () => {
    expect(ids(unshuffleUpcoming(items('a', 'x', 'c', 'y', 'b'), 0, original))).toEqual(['a', 'b', 'c', 'x', 'y'])
  })
})

describe('randomUpcomingSlot', () => {
  it('lands after the current track, the end included', () => {
    expect(randomUpcomingSlot(5, 1, () => 0)).toBe(2)
    expect(randomUpcomingSlot(5, 1, () => 0.999)).toBe(5)
    expect(randomUpcomingSlot(1, 0, () => 0.5)).toBe(1)
  })
})

describe('shuffledRound', () => {
  it('never starts with the track that just ended', () => {
    for (let seed = 0; seed < 50; seed++) {
      const round = ids(shuffledRound(items('a', 'b', 'c'), 'a', seeded(seed)))
      expect(round[0]).not.toBe('a')
      expect([...round].sort()).toEqual(['a', 'b', 'c'])
    }
  })

  it('a single track is simply played again', () => {
    expect(ids(shuffledRound(items('a'), 'a'))).toEqual(['a'])
  })
})
```

- [ ] **Step 2: Run it** — `pnpm exec vitest run --project unit test/unit/app/queue-order.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement** — `app/lib/queue-order.ts`:

```ts
/**
 * Play-order rules of shuffle, used by the player store (app/stores/player.ts).
 *
 * A queue is played tracks, the current one at `index`, then the upcoming
 * ones; only the upcoming part is ever reordered. Pure functions: randomness
 * comes from `random` (Math.random by default), so tests pass a seeded one.
 */

/** A source of random numbers in [0, 1), like Math.random. */
export type Random = () => number

/** Anything identified by a track id (queue items). */
interface WithId {
  id: string
}

/** Swaps two positions of an array, in place. */
function swap<T>(items: T[], i: number, j: number): void {
  const kept = items[i]!
  items[i] = items[j]!
  items[j] = kept
}

/** Fisher–Yates: a shuffled copy of `items`, every order equally likely. */
export function shuffled<T>(items: readonly T[], random: Random = Math.random): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) swap(result, i, Math.floor(random() * (i + 1)))
  return result
}

/** The queue with the tracks after `index` shuffled; the played ones and the current one stay put. */
export function shuffleUpcoming<T>(queue: readonly T[], index: number, random: Random = Math.random): T[] {
  return [...queue.slice(0, index + 1), ...shuffled(queue.slice(index + 1), random)]
}

/**
 * The queue with the tracks after `index` back in `originalOrder`, carrying
 * on from the current track: first those that follow it in the original
 * order, then, wrapping around, those before it. Upcoming tracks the
 * original order does not know go last, in their current order.
 */
export function unshuffleUpcoming<T extends WithId>(queue: readonly T[], index: number, originalOrder: readonly string[]): T[] {
  const upcoming = queue.slice(index + 1)
  // Where the original order resumes: right after the current track (0 if it is unknown).
  const start = originalOrder.indexOf(queue[index]?.id ?? '') + 1
  // Distance of each id from that point, going around the original order.
  const rank = new Map(originalOrder.map((id, i) => [id, (i - start + originalOrder.length) % originalOrder.length]))
  const known = upcoming.filter(t => rank.has(t.id)).sort((a, b) => rank.get(a.id)! - rank.get(b.id)!)
  const unknown = upcoming.filter(t => !rank.has(t.id))
  return [...queue.slice(0, index + 1), ...known, ...unknown]
}

/** Where a track added while shuffled goes: any slot after the current track, the end included. */
export function randomUpcomingSlot(queueLength: number, index: number, random: Random = Math.random): number {
  // Slots index + 1 … queueLength: there are queueLength - index of them.
  return index + 1 + Math.floor(random() * (queueLength - index))
}

/**
 * A new round of "repeat all" with shuffle on: the whole queue reshuffled,
 * never starting with `lastId` (the track that just ended) unless it is the
 * only one, so no track plays twice in a row.
 */
export function shuffledRound<T extends WithId>(queue: readonly T[], lastId: string, random: Random = Math.random): T[] {
  const round = shuffled(queue, random)
  if (round.length > 1 && round[0]!.id === lastId) swap(round, 0, 1 + Math.floor(random() * (round.length - 1)))
  return round
}
```

- [ ] **Step 4: Run it** → PASS. Then `pnpm exec eslint app/lib/queue-order.ts test/unit/app/queue-order.test.ts`.

- [ ] **Step 5: Commit** — `git add app/lib/queue-order.ts test/unit/app/queue-order.test.ts && git commit -m "Add the play-order rules of shuffle"`

---

### Task 2: Repeat in the player store

**Files:** Modify `app/stores/player.ts`, `test/unit/app/player-store.test.ts`

- [ ] **Step 1: Write the failing tests** — new `describe('repeat', …)` at the end of the test file (before `describe('restoring a saved queue'` is fine):

```ts
describe('repeat', () => {
  it('starts off and cycles off → all → one → off', () => {
    const player = usePlayerStore()
    expect(player.repeat).toBe('off')
    player.cycleRepeat()
    expect(player.repeat).toBe('all')
    player.cycleRepeat()
    expect(player.repeat).toBe('one')
    player.cycleRepeat()
    expect(player.repeat).toBe('off')
  })

  it('one: a track that ends starts again from 0:00, without a new URL', async () => {
    const player = usePlayerStore()
    await player.playTrack(library[0]!, library)
    player.cycleRepeat()
    player.cycleRepeat()

    engine.emit('ended')
    await vi.waitFor(() => expect(engine.play).toHaveBeenCalledTimes(2))

    expect(engine.seek).toHaveBeenLastCalledWith(0)
    expect(player.index).toBe(0)
    expect(tracksApi.playback).toHaveBeenCalledTimes(1)
  })

  it('one: next and previous still change track, and next stops at the last one', async () => {
    const player = usePlayerStore()
    await player.playTrack(library[1]!, library)
    player.cycleRepeat()
    player.cycleRepeat()

    await player.next()
    expect(player.index).toBe(2)
    expect(player.hasNext).toBe(false)
    await player.previous()
    expect(player.index).toBe(1)
  })

  it('all: after the last track the queue starts again from the first', async () => {
    const player = usePlayerStore()
    await player.playTrack(library[2]!, library)
    player.cycleRepeat()
    expect(player.hasNext).toBe(true)

    engine.emit('ended')
    await vi.waitFor(() => expect(player.index).toBe(0))
    expect(player.current?.id).toBe('a')
    expect(player.status).toBe('playing')
  })

  it('all: previous on the first track goes to the last one', async () => {
    const player = usePlayerStore()
    await player.playTrack(library[0]!, library)
    player.cycleRepeat()

    await player.previous()
    expect(player.index).toBe(2)
  })

  it('off: the end of the queue stops', async () => {
    const player = usePlayerStore()
    await player.playTrack(library[2]!, library)

    engine.emit('ended')
    expect(player.status).toBe('paused')
    expect(player.index).toBe(2)
  })

  it('is ignored on public pages: a shared playlist stops at its end', async () => {
    const player = usePlayerStore()
    player.cycleRepeat()
    await player.playSharedPlaylist(sharedPlaylist, 1)

    expect(player.hasNext).toBe(false)
    engine.emit('ended')
    expect(player.status).toBe('paused')
  })
})
```

`sharedPlaylist` must be reachable from this block: move the `SharedPlaylist` fixture used by `describe('shared playlists (public page)')` to module level (it is currently declared inside that describe — check with `grep -n "SharedPlaylist = " test/unit/app/player-store.test.ts`) and reuse it there.

- [ ] **Step 2: Run** `pnpm exec vitest run --project unit test/unit/app/player-store.test.ts -t repeat` → FAIL (`cycleRepeat` is not a function).

- [ ] **Step 3: Implement** in `app/stores/player.ts`:

1. Types and constants, after `QueueResult`:

```ts
/** What happens at the end of a track: carry on and stop after the last one, loop the queue, or repeat the track. */
export type RepeatMode = 'off' | 'all' | 'one'
```

and next to `VOLUME_KEY`:

```ts
/** localStorage key of shuffle and repeat (remembered like the volume). */
const MODES_KEY = 'chronoplayer:playback-modes'
/** Repeat modes in the order the button cycles through them. */
const REPEAT_MODES: readonly RepeatMode[] = ['off', 'all', 'one']
```

2. State, after `playbackRate` (the stored modes are read once):

```ts
  /** Shuffle and repeat saved by the previous visit. */
  const storedModes = readStoredModes()
  /** Shuffle is on: upcoming tracks play in random order (library playback only). */
  const shuffle = ref(storedModes.shuffle)
  /** Repeat mode (library playback only). */
  const repeat = ref<RepeatMode>(storedModes.repeat)
```

3. Derived state: replace `hasNext` / `hasPrevious` with:

```ts
  /** Shuffle and repeat apply: library playback (public pages play their list in order). */
  const modesApply = computed(() => sourceKey.value === librarySource.key)
  /** "Repeat all" is in effect: the queue starts again after its last track. */
  const loops = computed(() => modesApply.value && repeat.value === 'all' && queue.value.length > 0)
  /** There is a track after the current one, or the queue loops ("next" enabled). */
  const hasNext = computed(() => loops.value || index.value < queue.value.length - 1)
  /** There is a track before the current one, or the queue loops. */
  const hasPrevious = computed(() => loops.value || index.value > 0)
```

4. `ended` listener in `engine()`:

```ts
    e.on('ended', () => {
      if (modesApply.value && repeat.value === 'one') void replay()
      else if (hasNext.value) void next()
      else status.value = 'paused'
    })
```

5. `next` / `previous`, replacing the current ones:

```ts
  /** Next track of the queue; after the last one, a new round when the queue loops. */
  async function next(): Promise<void> {
    if (index.value < queue.value.length - 1) await loadIndex(index.value + 1, true)
    else if (loops.value) await startNewRound()
  }

  /**
   * Like every player: restarts the track after 3 s, otherwise goes to the
   * previous one (from the first, to the last when the queue loops).
   */
  async function previous(): Promise<void> {
    if (currentTime.value > RESTART_THRESHOLD) seek(0)
    else if (index.value > 0) await loadIndex(index.value - 1, true)
    else if (loops.value && queue.value.length > 1) await loadIndex(queue.value.length - 1, true)
    else seek(0)
  }

  /** "Repeat all" after the last track: back to the first one (Task 3 reshuffles here). */
  async function startNewRound(): Promise<void> {
    await loadIndex(0, true)
  }

  /**
   * "Repeat one": the track that just ended starts again from 0:00 without
   * reloading it. An expired URL is replaced first, at 0:00 (seeking it
   * would make the browser request the file again and fail).
   */
  async function replay(): Promise<void> {
    currentTime.value = 0
    if (sourceExpired()) {
      sourceRecovered = false
      if (!(await recoverSource(true, 0))) fail('Could not replay the track')
      return
    }
    engine().seek(0)
    await play()
  }
```

6. `cycleRepeat`, after `setPlaybackRate`:

```ts
  /** Repeat button: off → all → one → off (remembered). */
  function cycleRepeat(): void {
    repeat.value = REPEAT_MODES[(REPEAT_MODES.indexOf(repeat.value) + 1) % REPEAT_MODES.length]!
    storeModes({ shuffle: shuffle.value, repeat: repeat.value })
  }
```

7. Module-level helpers, after `storeVolume`:

```ts
/** Shuffle and repeat saved by the previous visit (both off when absent, invalid or storage is blocked). */
function readStoredModes(): { shuffle: boolean, repeat: RepeatMode } {
  try {
    const raw = globalThis.localStorage?.getItem(MODES_KEY)
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
function storeModes(modes: { shuffle: boolean, repeat: RepeatMode }): void {
  try {
    globalThis.localStorage?.setItem(MODES_KEY, JSON.stringify(modes))
  }
  catch {
    // Storage unavailable (e.g. private browsing): the modes are not remembered.
  }
}
```

8. Update the `VOLUME_KEY` comment ("the only player setting remembered across visits" → "remembered across visits, like shuffle and repeat"), and export `shuffle`, `repeat` (state), `cycleRepeat` (commands).

- [ ] **Step 4: Run** the whole store file → PASS (the existing tests keep passing: `hasNext` is unchanged with repeat off).

- [ ] **Step 5: Commit** — `git commit -am "Repeat the queue or the track in the player"`

---

### Task 3: Shuffle in the player store

**Files:** Modify `app/stores/player.ts`, `test/unit/app/player-store.test.ts`

- [ ] **Step 1: Write the failing tests** — a `describe('shuffle', …)`; it uses a longer library so a shuffle is visible, and mocks `Math.random` through `vi.spyOn` where an exact position matters:

```ts
describe('shuffle', () => {
  /** A library of six tracks: a shuffle of five upcoming ones is almost never the identity. */
  const six = ['a', 'b', 'c', 'd', 'e', 'f'].map(summary)
  /** Ids of a list of queue items. */
  const ids = (items: { id: string }[]) => items.map(t => t.id)

  it('turning it on shuffles the upcoming tracks only', async () => {
    const player = usePlayerStore()
    await player.playTrack(six[1]!, six)
    player.setShuffle(true)

    expect(player.shuffle).toBe(true)
    expect(ids(player.queue).slice(0, 2)).toEqual(['a', 'b'])
    expect(ids(player.upcoming).sort()).toEqual(['c', 'd', 'e', 'f'])
    expect(player.originalOrder).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
  })

  it('turning it off carries on in the original order from the current track', async () => {
    const player = usePlayerStore()
    await player.playTrack(six[1]!, six)
    player.setShuffle(true)
    player.setShuffle(false)

    expect(ids(player.upcoming)).toEqual(['c', 'd', 'e', 'f'])
    expect(player.originalOrder).toBeNull()
  })

  it('starting from the library plays the chosen track first, then all the others shuffled', async () => {
    const player = usePlayerStore()
    player.setShuffle(true)
    await player.playTrack(six[3]!, six)

    expect(player.index).toBe(0)
    expect(player.current?.id).toBe('d')
    expect(ids(player.upcoming).sort()).toEqual(['a', 'b', 'c', 'e', 'f'])
    // Back in order: carry on after "d", wrapping around.
    player.setShuffle(false)
    expect(ids(player.upcoming)).toEqual(['e', 'f', 'a', 'b', 'c'])
  })

  it('add to queue puts the track at a random place among the upcoming ones', async () => {
    const player = usePlayerStore()
    await player.playTrack(six[0]!, six.slice(0, 3))
    player.setShuffle(true)
    vi.spyOn(Math, 'random').mockReturnValue(0)

    await player.addToQueue(six[5]!)

    expect(player.queue[1]?.id).toBe('f')
    expect(player.originalOrder).toEqual(['a', 'b', 'c', 'f'])
  })

  it('play next still goes right after the current track', async () => {
    const player = usePlayerStore()
    await player.playTrack(six[0]!, six.slice(0, 3))
    player.setShuffle(true)

    await player.playNext(six[5]!)

    expect(player.queue[1]?.id).toBe('f')
  })

  it('repeat all reshuffles each new round, never repeating the last track', async () => {
    const player = usePlayerStore()
    player.setShuffle(true)
    await player.playTrack(six[0]!, six)
    player.cycleRepeat()
    const last = player.queue.at(-1)!.id

    await player.playFromQueue(5)
    await player.next()

    expect(player.index).toBe(0)
    expect(player.current?.id).not.toBe(last)
    expect(ids(player.queue).sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
  })

  it('on public pages it only changes the setting', async () => {
    const player = usePlayerStore()
    await player.playSharedPlaylist(sharedPlaylist, 0)
    const order = ids(player.queue)

    player.setShuffle(true)

    expect(player.shuffle).toBe(true)
    expect(ids(player.queue)).toEqual(order)
  })

  it('is remembered with the repeat mode for the next visit', () => {
    const stored = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
    })
    try {
      const player = usePlayerStore()
      player.setShuffle(true)
      player.cycleRepeat()

      setActivePinia(createPinia())
      const next = usePlayerStore()
      expect(next.shuffle).toBe(true)
      expect(next.repeat).toBe('all')
    }
    finally {
      vi.unstubAllGlobals()
    }
  })
})
```

Add `vi.restoreAllMocks()` to the file's `afterEach` (the `Math.random` spy). The library fixture must stay at three tracks for the other tests.

- [ ] **Step 2: Run** `-t shuffle` → FAIL (`setShuffle` is not a function).

- [ ] **Step 3: Implement** in `app/stores/player.ts`:

1. Import: `import { randomUpcomingSlot, shuffledRound, shuffleUpcoming, unshuffleUpcoming } from '~/lib/queue-order'`.

2. State, after `repeat`:

```ts
  /**
   * Track ids of the queue in its order before shuffling, to put it back
   * when shuffle is turned off; null while shuffle is off or nothing plays.
   */
  const originalOrder = ref<string[] | null>(null)
```

3. `playTrack`, replacing the queue building:

```ts
    setSource(librarySource)
    let items = [...context]
    let i = items.findIndex(t => t.id === track.id)
    if (i === -1) {
      items = [track, ...items]
      i = 0
    }
    if (shuffle.value) {
      originalOrder.value = items.map(t => t.id)
      // The chosen track first, all the others of the list shuffled after it.
      items = shuffleUpcoming([items[i]!, ...items.filter((_, j) => j !== i)], 0)
      i = 0
    }
    queue.value = items
    await loadIndex(i, true)
```

4. `setShuffle`, next to `cycleRepeat`:

```ts
  /**
   * Shuffle button (remembered). With library playback the upcoming tracks
   * are reordered at once; on a public page only the setting changes.
   */
  function setShuffle(on: boolean): void {
    if (on === shuffle.value) return
    shuffle.value = on
    storeModes({ shuffle: shuffle.value, repeat: repeat.value })
    if (!modesApply.value || index.value < 0) {
      originalOrder.value = null
      return
    }
    if (on) {
      originalOrder.value = queue.value.map(t => t.id)
      queue.value = shuffleUpcoming(queue.value, index.value)
    }
    else {
      if (originalOrder.value) queue.value = unshuffleUpcoming(queue.value, index.value, originalOrder.value)
      originalOrder.value = null
    }
  }
```

5. `startNewRound` reshuffles:

```ts
  /** "Repeat all" after the last track: back to the first one, reshuffled when shuffle is on. */
  async function startNewRound(): Promise<void> {
    if (shuffle.value) queue.value = shuffledRound(queue.value, queue.value[index.value]?.id ?? '')
    await loadIndex(0, true)
  }
```

6. A helper next to `detach`, and its use in `playNext` (after the splice) and `addToQueue`:

```ts
  /** A track added while shuffled joins the original order too (at its end). */
  function rememberOriginal(id: string): void {
    if (originalOrder.value && !originalOrder.value.includes(id)) originalOrder.value = [...originalOrder.value, id]
  }
```

`addToQueue`, replacing `queue.value = [...queue.value, track]`:

```ts
    if (shuffle.value) {
      const updated = [...queue.value]
      updated.splice(randomUpcomingSlot(updated.length, index.value), 0, track)
      queue.value = updated
      rememberOriginal(track.id)
    }
    else {
      queue.value = [...queue.value, track]
    }
```

`playNext`, after `queue.value = updated`: `rememberOriginal(track.id)`.

7. `close()`: add `originalOrder.value = null`.

8. Export `originalOrder` (state) and `setShuffle` (commands).

- [ ] **Step 4: Run** the whole store file → PASS.

- [ ] **Step 5: Commit** — `git commit -am "Shuffle the upcoming tracks and put them back in order"`

---

### Task 4: Saved queue, format 2

**Files:** Modify `app/lib/queue-storage.ts`, `test/unit/app/queue-storage.test.ts`, `app/plugins/queue-persistence.client.ts`, `app/stores/player.ts` (`restoreQueue`)

- [ ] **Step 1: Write the failing tests** in `queue-storage.test.ts`:
  - the first test expects `version: 2`;
  - new tests:

```ts
  it('saves the original order of a shuffled queue', () => {
    saveQueue({ userId: 'u1', trackIds: ['c', 'a', 'b'], index: 0, position: 0, originalTrackIds: ['a', 'b', 'c'] })
    expect(readSavedQueue('u1')?.originalTrackIds).toEqual(['a', 'b', 'c'])
  })

  it('still reads a queue saved in format 1 (no shuffle)', () => {
    localStorage.setItem(KEY, JSON.stringify({ version: 1, userId: 'u1', trackIds: ['a', 'b'], index: 1, position: 3 }))
    expect(readSavedQueue('u1')).toMatchObject({ trackIds: ['a', 'b'], index: 1, position: 3 })
    expect(readSavedQueue('u1')?.originalTrackIds).toBeUndefined()
  })
```

  - in the `discards %s` table: `['a bad original order', JSON.stringify({ version: 2, userId: 'u1', trackIds: ['a'], index: 0, position: 0, originalTrackIds: [1] })]`;
  - in `describe('resolveSavedQueue')`: `it('drops deleted tracks from the original order too', …)` with `resolveSavedQueue({ trackIds: ['b', 'a'], index: 0, position: 0, originalTrackIds: ['a', 'b', 'x'] }, tracks)` → `.originalIds` equals `['a', 'b']` (use the fixture of that describe), and one without `originalTrackIds` → `.originalIds` undefined.

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** in `app/lib/queue-storage.ts`:
  - `const VERSION = 2` with `/** Formats still read: version 1 is a queue without shuffle (no originalTrackIds). */ const READABLE_VERSIONS: readonly number[] = [1, 2]`;
  - `SavedQueue.version: 1 | 2`, plus `/** With shuffle on: the queue's ids in their order before shuffling. */ originalTrackIds?: string[]`;
  - `saveQueue(state: Pick<SavedQueue, 'userId' | 'trackIds' | 'index' | 'position' | 'originalTrackIds'>)` (writes `version: VERSION`; `JSON.stringify` leaves an undefined field out);
  - validation: `READABLE_VERSIONS.includes(saved?.version as number)` instead of `=== VERSION`, and `&& (saved.originalTrackIds === undefined || (Array.isArray(saved.originalTrackIds) && saved.originalTrackIds.every(id => typeof id === 'string')))`;
  - `resolveSavedQueue` takes `Pick<SavedQueue, 'trackIds' | 'index' | 'position' | 'originalTrackIds'>`, returns `originalIds?: string[]` = `saved.originalTrackIds?.filter(id => byId.has(id))` in both return statements;
  - update the module comment ("Only track ids are stored…" gains "and, with shuffle on, their order before shuffling").

  In `app/stores/player.ts`, `restoreQueue(items, at, position, originalIds?: string[])`:

```ts
    queue.value = [...items]
    // Shuffle on: the order to go back to (a queue saved without one keeps its current order).
    originalOrder.value = shuffle.value ? (originalIds ?? items.map(t => t.id)) : null
```

  In `app/plugins/queue-persistence.client.ts`:
  - `saveQueue({ …, originalTrackIds: player.originalOrder ?? undefined })`;
  - `player.restoreQueue(resolved.items, resolved.index, resolved.position, resolved.originalIds)`;
  - the save watcher also watches `() => player.originalOrder`; the header comment mentions shuffle.

- [ ] **Step 4: Run** both unit files and the store file → PASS.

- [ ] **Step 5: Commit** — `git commit -am "Save the original order of a shuffled queue"`

---

### Task 5: Buttons

**Files:** Modify `app/components/player/PlayerControls.vue`, `app/components/player/PlayerBar.vue`

- [ ] **Step 1:** `PlayerControls.vue`: prop `showModes?: boolean` (default `true`, doc comment), header comment mentions shuffle and repeat; a shuffle button before Previous and a repeat button after Next:

```vue
    <UButton
      v-if="showModes && player.queueEditable"
      icon="i-lucide-shuffle"
      :color="player.shuffle ? 'primary' : 'neutral'"
      variant="ghost"
      :size="size"
      :aria-label="`Shuffle: ${player.shuffle ? 'on' : 'off'}`"
      :aria-pressed="player.shuffle"
      data-testid="player-shuffle"
      @click="player.setShuffle(!player.shuffle)"
    />
```

```vue
    <UButton
      v-if="showModes && player.queueEditable"
      :icon="player.repeat === 'one' ? 'i-lucide-repeat-1' : 'i-lucide-repeat'"
      :color="player.repeat === 'off' ? 'neutral' : 'primary'"
      variant="ghost"
      :size="size"
      :aria-label="`Repeat: ${player.repeat}`"
      :aria-pressed="player.repeat !== 'off'"
      data-testid="player-repeat"
      @click="player.cycleRepeat()"
    />
```

- [ ] **Step 2:** `PlayerBar.vue`: the compact phone controls get `:show-modes="false"`.

- [ ] **Step 3:** lint + `pnpm typecheck` (unknown components and prop types are checked).

- [ ] **Step 4:** Look at the full-screen view at phone width (375 px) with a Playwright screenshot: the controls row must not overflow next to the volume. If it does, wrap the row (`flex-wrap justify-center gap-y-2`) in `PlayerExpanded.vue`.

- [ ] **Step 5: Commit** — `git commit -am "Add shuffle and repeat buttons to the player"`

---

### Task 6: End-to-end test

**Files:** Modify `test/e2e/queue.spec.ts`

- [ ] **Step 1:** a second test in `describe('editable queue')`:

```ts
  test('shuffle reorders the upcoming tracks and puts them back; repeat one restarts the track', async ({ page }) => {
    await signUp(page)
    const id = uniqueId()
    const titles = ['a', 'b', 'c', 'd', 'e'].map(letter => `s${letter}-${id}`)
    for (const title of titles) await uploadTrack(page, title)
    await page.getByRole('link', { name: 'Go to library' }).click()

    // Newest first: playing the last upload leaves the other four, newest first, up next.
    const [first, ...rest] = [...titles].reverse()
    await page.getByTestId('track-row').filter({ hasText: first! }).getByTestId('track-title').click()
    const bar = page.getByTestId('player-bar')
    const toggle = bar.locator('[data-testid="player-toggle"]:visible')
    await expect(toggle).toHaveAttribute('aria-label', 'Pause')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-label', 'Play')

    /** The Up next titles, read from the panel (opened and closed again). */
    const upNext = async () => {
      await bar.getByTestId('player-queue').click()
      const items = page.getByTestId('queue-item-title')
      await expect(items).toHaveCount(rest.length)
      const texts = await items.allTextContents()
      await page.keyboard.press('Escape')
      return texts
    }
    expect(await upNext()).toEqual(rest)

    // --- Shuffle: a different order of the same tracks (4 tracks: 1 chance in 24 of the same order, so retry) ---
    const shuffleButton = bar.getByTestId('player-shuffle')
    let shuffledOrder = rest
    for (let attempt = 0; attempt < 5 && shuffledOrder.join() === rest.join(); attempt++) {
      if (attempt > 0) await shuffleButton.click()
      await shuffleButton.click()
      await expect(shuffleButton).toHaveAttribute('aria-label', 'Shuffle: on')
      shuffledOrder = await upNext()
    }
    expect(shuffledOrder).not.toEqual(rest)
    expect([...shuffledOrder].sort()).toEqual([...rest].sort())

    // --- Shuffle off: back in order ---
    await shuffleButton.click()
    await expect(shuffleButton).toHaveAttribute('aria-label', 'Shuffle: off')
    expect(await upNext()).toEqual(rest)

    // --- Repeat one: the 3-second track starts again instead of moving on ---
    const repeatButton = bar.getByTestId('player-repeat')
    await repeatButton.click()
    await repeatButton.click()
    await expect(repeatButton).toHaveAttribute('aria-label', 'Repeat: one')
    await toggle.click()
    const elapsed = bar.getByTestId('player-elapsed')
    await expect(elapsed).toHaveText('0:02')
    await expect(elapsed).toHaveText(/^0:0[01]$/)
    await expect(bar.getByTestId('player-title')).toHaveText(first!)
    await expect(toggle).toHaveAttribute('aria-label', 'Pause')
    await toggle.click()
  })
```

- [ ] **Step 2:** run it on the production build (worktree if the user's dev server is running) and in dev mode (`E2E_DEV=1`, a dev server on another port); both PASS.

- [ ] **Step 3: Commit** — `git commit -am "Test shuffle and repeat end to end"`

---

### Task 7: README

- [ ] **Step 1:** Features table, *Player* row: "…previous/next, **shuffle and repeat** (off / all / one, remembered), volume…"; 7.5: "Next" / "Previous" rules with repeat, and the store paragraph mentions the modes saved in `localStorage`; 7.6: a paragraph on shuffle (reorders the upcoming tracks, original order restored "from here", add to queue lands at a random place, play next right after the current track, library playback only) and the saved queue's `originalTrackIds`.
- [ ] **Step 2: Commit** — `git commit -am "Document shuffle and repeat"`

---

### Task 8: Final checks

- [ ] `pnpm exec eslint .` · `pnpm typecheck` · `pnpm exec vitest run` · full e2e suite on the production build → all green.
- [ ] Push the branch; ask the user before `pnpm merge:main` (it deploys production).
