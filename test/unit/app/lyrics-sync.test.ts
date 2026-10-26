/**
 * The lyrics sync editor's rows (app/lib/lyrics-sync.ts), with a fake player: stamping takes the
 * playback time and skips section headers, undo clears the last line and steps back, replay and
 * select move playback only while the track is loaded, nudges and drags never go below 0,
 * rebuilding from edited lyrics keeps the times of unchanged lines, and an imported LRC
 * replaces everything.
 */
import { describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import { syncRowsFromLyrics } from '~~/shared/utils/lyrics'
import { createLyricsSync, REPLAY_PREROLL, type SyncPlayback } from '~/lib/lyrics-sync'

/** Lyrics with a section header first: rows 0 (header), 1, 2, 3. */
const LYRICS = '[Verse 1]\nFirst line\nSecond line\nThird line'

/** A fake player, loaded and paused at 0 unless told otherwise. */
function fakePlayback(state: Partial<Pick<SyncPlayback, 'loaded' | 'currentTime' | 'playing'>> = {}) {
  return reactive({
    loaded: true,
    currentTime: 0,
    playing: false,
    seek: vi.fn(),
    play: vi.fn(),
    ...state,
  })
}

/** A sync of LYRICS over a fake player. */
function setup(state?: Parameters<typeof fakePlayback>[0]) {
  // The player the sync reads and moves.
  const playback = fakePlayback(state)
  return { playback, sync: createLyricsSync(syncRowsFromLyrics(LYRICS), playback) }
}

describe('stamping', () => {
  it('gives the next lyric line the playback time, skipping the section header', () => {
    const { playback, sync } = setup({ currentTime: 12.345 })
    expect(sync.cursor.value).toBe(1)
    sync.stamp()
    expect(sync.rows.value[0]!.time).toBeNull()
    expect(sync.rows.value[1]!.time).toBe(12.35)
    expect(sync.selected.value).toBe(1)
    expect(sync.syncedCount.value).toBe(1)
    // The next one waits for the next tap.
    playback.currentTime = 15
    sync.stamp()
    expect(sync.rows.value[2]!.time).toBe(15)
    expect(sync.cursor.value).toBe(3)
  })

  it('does nothing while another track is in the player, or once every line is synced', () => {
    const { playback, sync } = setup({ loaded: false, currentTime: 5 })
    sync.stamp()
    expect(sync.syncedCount.value).toBe(0)
    playback.loaded = true
    for (let i = 0; i < 4; i++) sync.stamp()
    expect(sync.syncedCount.value).toBe(3)
    expect(sync.cursor.value).toBe(sync.rows.value.length)
  })

  it('knows which line is playing: the last stamped one whose time has passed', () => {
    const { playback, sync } = setup({ currentTime: 10 })
    sync.stamp()
    playback.currentTime = 20
    sync.stamp()
    playback.currentTime = 15
    expect(sync.playingIndex.value).toBe(1)
    playback.currentTime = 25
    expect(sync.playingIndex.value).toBe(2)
    playback.loaded = false
    expect(sync.playingIndex.value).toBe(-1)
  })
})

describe('undo', () => {
  it('clears the last stamped line and goes back to just before the one before it', () => {
    const { playback, sync } = setup({ currentTime: 10 })
    sync.stamp()
    playback.currentTime = 20
    sync.stamp()
    sync.undo()
    expect(sync.rows.value[2]!.time).toBeNull()
    expect(sync.selected.value).toBeNull()
    expect(playback.seek).toHaveBeenLastCalledWith(9)
    // The first line undone: back to the start.
    sync.undo()
    expect(playback.seek).toHaveBeenLastCalledWith(0)
    expect(sync.syncedCount.value).toBe(0)
  })

  it('does nothing when no line is synced', () => {
    const { playback, sync } = setup()
    sync.undo()
    expect(playback.seek).not.toHaveBeenCalled()
  })
})

describe('replay and select', () => {
  it('replays the selected line from just before its start, and resumes playback', () => {
    const { playback, sync } = setup({ currentTime: 10 })
    sync.stamp()
    sync.replay()
    expect(playback.seek).toHaveBeenLastCalledWith(10 - REPLAY_PREROLL)
    expect(playback.play).toHaveBeenCalledOnce()
  })

  it('replays the line playing when none is selected, never before 0', () => {
    const { playback, sync } = setup({ currentTime: 0.5, playing: true })
    sync.stamp()
    sync.selected.value = null
    sync.replay()
    expect(playback.seek).toHaveBeenLastCalledWith(0)
    // Already playing: not started again.
    expect(playback.play).not.toHaveBeenCalled()
  })

  it('selects a lyric line and jumps to it, never a section header', () => {
    const { playback, sync } = setup({ currentTime: 30 })
    sync.stamp()
    sync.select(0)
    expect(sync.selected.value).toBe(1)
    sync.select(1)
    expect(playback.seek).toHaveBeenLastCalledWith(30)
    // An unsynced line is selected, with nowhere to jump.
    sync.select(2)
    expect(sync.selected.value).toBe(2)
    expect(playback.seek).toHaveBeenCalledOnce()
  })

  it('moves nothing while the track is not loaded', () => {
    const { playback, sync } = setup({ currentTime: 30 })
    sync.stamp()
    playback.loaded = false
    sync.replay()
    sync.seekTo(1)
    sync.resetAll()
    expect(playback.seek).not.toHaveBeenCalled()
    // The reset itself still happens.
    expect(sync.syncedCount.value).toBe(0)
  })
})

describe('adjusting a line', () => {
  it('nudges a synced line by steps, never below 0; an unsynced one stays as it is', () => {
    const { sync } = setup({ currentTime: 0.04 })
    sync.stamp()
    sync.nudge(1, 0.1)
    expect(sync.rows.value[1]!.time).toBe(0.14)
    sync.nudge(1, -1)
    expect(sync.rows.value[1]!.time).toBe(0)
    sync.nudge(2, 0.1)
    expect(sync.rows.value[2]!.time).toBeNull()
  })

  it('moves a line dragged on the waveform and selects it; a header cannot move', () => {
    const { sync } = setup()
    sync.moveLine(2, 42.5)
    expect(sync.rows.value[2]!.time).toBe(42.5)
    expect(sync.selected.value).toBe(2)
    sync.moveLine(2, -3)
    expect(sync.rows.value[2]!.time).toBe(0)
    sync.moveLine(0, 10)
    expect(sync.rows.value[0]!.time).toBeNull()
  })

  it('resets every time and goes back to the start', () => {
    const { playback, sync } = setup({ currentTime: 8 })
    sync.stamp()
    sync.resetAll()
    expect(sync.syncedCount.value).toBe(0)
    expect(sync.selected.value).toBeNull()
    expect(playback.seek).toHaveBeenLastCalledWith(0)
  })
})

describe('new lyrics and imported LRC', () => {
  it('rebuilds from edited lyrics, keeping the times of the lines still there (each once)', () => {
    const { playback, sync } = setup({ currentTime: 10 })
    sync.stamp()
    playback.currentTime = 20
    sync.stamp()
    sync.reloadFromLyrics('[Chorus]\nFirst line\nNew line\nFirst line\nSecond line')
    expect(sync.rows.value.map(r => [r.text, r.time])).toEqual([
      ['[Chorus]', null],
      ['First line', 10],
      ['New line', null],
      // A repeated line takes the old time once only.
      ['First line', null],
      ['Second line', 20],
    ])
  })

  it('replaces every row with imported lines, and clears the selection', () => {
    const { sync } = setup({ currentTime: 10 })
    sync.stamp()
    sync.replaceWith([{ time: 1, text: 'Only line' }])
    expect(sync.rows.value.map(r => [r.text, r.time])).toEqual([['Only line', 1]])
    expect(sync.selected.value).toBeNull()
  })
})
