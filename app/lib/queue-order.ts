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
