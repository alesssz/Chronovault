/**
 * TrackList: clicking a title plays it, or opens the full-screen view for the current track.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { UApp } from '#components'
import type { TrackDetail, TrackSummary } from '~~/shared/types/track'
import TrackList from '~/components/track/TrackList.vue'

/** A private library item with lyrics. */
function summary(id: string, title: string): TrackSummary {
  return {
    id, title, composers: 'Chronovault', album: null, year: 2026, genreId: null, mastered: false,
    visibility: 'private', durationSeconds: 200, hasLyrics: true, hasSyncedLyrics: true, coverUrl: null,
    createdAt: '', updatedAt: '',
  }
}

/** The list rendered by every test. */
const tracks = [summary('a', 'Artemisia'), summary('b', 'Caravaggio')]

/** TrackList inside UApp, which provides what Nuxt UI tooltips need (as in the real app). */
async function mountList() {
  const Host = defineComponent({
    render: () => h(UApp, null, () => h(TrackList, { tracks, genreName: () => null })),
  })
  const wrapper = await mountSuspended(Host)
  return {
    titles: () => wrapper.findAll('[data-testid="track-title"]'),
    emitted: (event: string) => wrapper.findComponent(TrackList).emitted(event),
  }
}

describe('TrackList', () => {
  // The real store (Nuxt environment), reset before every test.
  let player: ReturnType<typeof usePlayerStore>

  beforeEach(() => {
    player = usePlayerStore()
    player.close()
  })

  it('clicking the name of a track plays it', async () => {
    const list = await mountList()
    await list.titles()[1]!.trigger('click')
    expect(list.emitted('play')?.[0]?.[0]).toMatchObject({ id: 'b' })
    expect(player.expanded).toBe(false)
  })

  it('clicking the name of the track in the player opens the full-screen view', async () => {
    player.current = { ...tracks[0]!, description: null, sunoPrompt: null, lyrics: null, lyricsSynced: null, peaks: null, mimeType: 'audio/flac', sizeBytes: 1, audioPath: 'u/a.flac', coverPath: null } as TrackDetail
    player.status = 'paused'
    const list = await mountList()

    await list.titles()[0]!.trigger('click')

    expect(player.expanded).toBe(true)
    expect(list.emitted('play')).toBeUndefined()
  })

  it('a track that failed to play is started again instead', async () => {
    player.current = { ...tracks[0]!, description: null, sunoPrompt: null, lyrics: null, lyricsSynced: null, peaks: null, mimeType: 'audio/flac', sizeBytes: 1, audioPath: 'u/a.flac', coverPath: null } as TrackDetail
    player.status = 'error'
    const list = await mountList()

    await list.titles()[0]!.trigger('click')

    expect(list.emitted('play')?.[0]?.[0]).toMatchObject({ id: 'a' })
    expect(player.expanded).toBe(false)
  })
})
