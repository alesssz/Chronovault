# Shuffle and repeat — design

Date: 2026-10-22 · Branch: `feat/shuffle-repeat`

## Goal

The player gets the two modes every music player has: **shuffle** (on/off) and **repeat** (off → all → one). They apply to library playback; the public share pages (`/t`, `/p`) keep playing in sequence.

## Current model (unchanged)

`app/stores/player.ts` holds the queue as an array plus an index: played tracks before `index`, the current track at `index`, upcoming tracks after it. The Up next panel shows `upcoming`, the queue is editable for library playback only (`queueEditable`), and `app/plugins/queue-persistence.client.ts` saves it on the device through `app/lib/queue-storage.ts`. Track ids are unique within a queue (`detach` moves a track instead of duplicating it).

## Approach

Shuffle **reorders the queue array** itself and keeps the original order aside to restore it. Next, previous, Up next, manual reordering and the saved queue keep working on the real play order, untouched. (Rejected: a separate play-order permutation over an unchanged queue — every queue function would have to translate positions through it.)

The ordering rules are pure functions in a new module, `app/lib/queue-order.ts`, with an injectable random source (`() => number`, `Math.random` by default) so tests are deterministic. Shuffling is Fisher–Yates.

## Behaviour

### State

- `shuffle: boolean`, `repeat: 'off' | 'all' | 'one'` — reactive, exposed by the store, set through `setShuffle(on)` and `cycleRepeat()` (off → all → one → off).
- `originalOrder: string[] | null` — track ids of the queue before its first shuffle (plus tracks added since); kept after shuffle is turned off, until another list starts; `null` for a list never shuffled, a shared list or an idle player.

### Shuffle

- **Turning it on:** the upcoming tracks are shuffled; the current track and the played ones stay where they are. `originalOrder` = the current queue's ids.
- **Turning it off:** the tracks still to play go back to the original order, starting with the track that follows the current one in `originalOrder` and wrapping around to the beginning ("carry on in order from here"). Upcoming tracks missing from `originalOrder` (none expected, but the rule must be total) go last, in their current relative order. Manual moves made while shuffled are lost: the user asked for the original order. `originalOrder` is kept: turning shuffle on again keeps the list's real order, not the mixed queue.
- **Starting playback from the library with shuffle on** (`playTrack(track, context)`): the clicked track plays first and the rest of the context follows, shuffled — the tracks that came before it included. Queue = `[clicked, ...shuffled others]`, index 0, `originalOrder` = the context's ids.
- **Add to queue with shuffle on:** the track goes to a random position among the upcoming tracks (any slot after the current one, the end included), and is appended to `originalOrder`.
- **Play next:** always right after the current track, shuffle or not (an explicit choice); appended to `originalOrder` when shuffle is on, if not already in it.
- **Play all** (the playlist page's *Play* button, `playAll(list)`): from the first track, or with shuffle on from a random one, the rest shuffled after it.
- **Restoring a saved queue, playing from Up next, moving and removing:** unchanged; a removed track stays harmlessly in `originalOrder` (only upcoming tracks are sorted on unshuffle).

### Repeat

- **one:** when a track ends it goes back to 0:00 and plays again, without reloading the source (an expired signed URL is replaced first, at 0:00: seeking it would make the browser request the file again). Next and Previous change track following the rules of **off** (Next is disabled on the last track, Previous on the first restarts it); the mode stays.
- **all:** after the last track the queue starts again from the first. `hasNext` is true whenever the queue is not empty, so Next is never disabled; Previous on the first track (within the first 3 s, the existing restart rule) goes to the last one. A single-track queue simply starts again in place, like *one*. With shuffle off after a shuffle, each new round puts the whole queue back in `originalOrder` (tracks it does not know last). With shuffle on, each new round reshuffles the whole queue first; if the reshuffled first track is the one that just ended, it is swapped with another so no track plays twice in a row (unless the queue has one track).
- **off:** the end of the queue stops, as today.

### Public pages

When the source is not the library (`sourceKey !== librarySource.key`), shuffle and repeat are ignored: shared playlists play in sequence and stop at the end, and `hasNext` follows the plain rule. The settings stay stored and apply again as soon as the library plays. `setShuffle` while a shared source plays changes the setting only; it reorders nothing.

## Interface

- `app/components/player/PlayerControls.vue` gets a **shuffle** button left of Previous and a **repeat** button right of Next, behind a `showModes` prop (default `true`).
  - Shuffle: `i-lucide-shuffle`; neutral when off, primary when on.
  - Repeat: `i-lucide-repeat` (neutral) for off, `i-lucide-repeat` (primary) for all, `i-lucide-repeat-1` (primary) for one.
  - Both carry `aria-pressed` and a label naming the state — `Shuffle: off` / `Shuffle: on`, `Repeat: off` / `Repeat: all` / `Repeat: one` — and `data-testid="player-shuffle"` / `"player-repeat"`.
  - Shown only while `player.queueEditable` (library playback).
- Shown in the full-screen view (controls on their own row, the volume under them: six buttons fill that column) and in the bar on screens from 1280 px (`xl`, through a `modesClass` prop); narrower bars have no room left for the waveform, and the compact phone bar passes `:show-modes="false"`, as it already hides Stop.
- New icons join the Nuxt Icon client bundle automatically (local lucide collection).

## Persistence

- **Modes:** saved in `localStorage` under `chronoplayer:playback-modes` as `{ shuffle, repeat }`, read and written like the volume (try/catch; invalid or missing values → off). Volume, shuffle and repeat are `skipHydrate` refs: a server-rendered page (`/t`, `/p`) must not replace them with the server's defaults. The store comment that calls the volume "the only player setting remembered across visits" is updated.
- **Saved queue:** `app/lib/queue-storage.ts` moves to format **version 2**, adding an optional `originalTrackIds: string[]` written once the queue has been shuffled (it survives turning shuffle off, see State). Version 1 is still read, as a queue without shuffle; any other version is discarded, as today. On restore, `originalTrackIds` goes through the same filter as the queue (tracks deleted since are dropped), and `restoreQueue` takes it as an optional argument. The persistence plugin's save watcher also watches `shuffle` and `originalOrder`, so toggling shuffle saves the queue at once.
- If a saved queue restores without `originalTrackIds` while the stored mode says shuffle on (e.g. a version 1 queue), shuffle starts with `originalOrder` = the restored queue as it is: turning it off then keeps that order.

## Testing

- **Unit, `queue-order.ts`:** shuffle keeps played and current tracks in place and permutes the rest; unshuffle carries on from the current track with wrap-around and puts unknown ids last; random insertion lands after the current track; a new round never starts with the track that just ended. All with a seeded random source.
- **Unit, player store (`test/unit/app/player-store.test.ts`, existing `FakeEngine`):** next / previous / `ended` in each repeat mode; repeat one seeks to 0 and plays without a new `playback()` call; shuffle on at `playTrack` puts the clicked track first; add to queue and play next with shuffle on; shuffle off restores the order; modes are ignored for shared sources; modes are saved and read back.
- **Unit, queue storage:** version 1 and version 2 are both read; `originalTrackIds` is filtered like the queue.
- **E2E, `test/e2e/queue.spec.ts`:** turning shuffle on changes the Up next order (five tracks, so four upcoming: an unchanged order has a 1-in-24 chance, so the test toggles shuffle off and on again, up to five times, until the order differs), turning it off restores it; repeat one restarts the track when it ends (short generated WAV).

## Documentation

README: the *Player* row of the features table (1), section 7.6 *Editable queue*, and the saved-queue description if it lists the stored fields.

## Out of scope

Shuffle and repeat on the public share pages; a separate "priority queue" for tracks added while shuffled (Spotify-style); syncing modes across devices.
