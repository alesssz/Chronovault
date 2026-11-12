/**
 * Replace audio in the track editor (TrackReplaceAudioDialog): the note on
 * synced lyrics shows only for a track that has them (they are kept, but
 * flagged for checking), Replace waits for a file, and the file picked
 * shows in the drop zone's place (name, format, size). The dialog's content
 * is teleported to the page's body, where it is looked for.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { UApp } from '#components'
import type { TrackDetail } from '~~/shared/types/track'
import TrackReplaceAudioDialog from '~/components/track/TrackReplaceAudioDialog.vue'

/** A saved track (FLAC, 3 minutes), with or without synced lyrics. */
function track(hasSyncedLyrics: boolean): TrackDetail {
  return {
    id: 't1', title: 'Montgisard', composers: null, album: null, year: null, genreId: null, subgenreId: null,
    mastered: false, visibility: 'private', status: 'draft', durationSeconds: 180, hasLyrics: hasSyncedLyrics,
    hasSyncedLyrics, syncNeedsReview: false, coverUrl: null, createdAt: '', updatedAt: '', description: null,
    sunoPrompt: null, lyrics: null, lyricsSynced: hasSyncedLyrics ? [{ time: 1, text: 'Crowned at thirteen' }] : null,
    peaks: null, mimeType: 'audio/flac', sizeBytes: 1, audioPath: 'u/t1.flac', coverPath: null,
  }
}

/** The dialog, open, for `detail`, inside UApp (as in the real app). */
async function mountDialog(detail: TrackDetail) {
  // A host rendering the dialog open, as the editor's side column does.
  const Host = defineComponent({
    render: () => h(UApp, null, () => h(TrackReplaceAudioDialog, { track: detail, open: true })),
  })
  // The host, mounted.
  const wrapper = await mountSuspended(Host)
  // The modal opens on the next ticks (teleported to the body).
  await nextTick()
  await nextTick()
  return wrapper
}

/** An element of the open dialog, by its test id. */
function inDialog(testId: string): HTMLElement | null {
  return document.body.querySelector(`[data-testid="${testId}"]`)
}

afterEach(() => {
  // Nothing of a dialog left for the next test.
  document.body.innerHTML = ''
})

describe('TrackReplaceAudioDialog', () => {
  it('says synced lyrics are kept but marked for checking, for a track that has them', async () => {
    await mountDialog(track(true))
    expect(inDialog('replace-audio-sync-note')?.textContent).toContain('marked for checking')
  })

  it('says nothing about a sync a track does not have', async () => {
    await mountDialog(track(false))
    expect(inDialog('replace-audio-dropzone')).not.toBeNull()
    expect(inDialog('replace-audio-sync-note')).toBeNull()
  })

  it('waits for a file before Replace can be pressed', async () => {
    await mountDialog(track(false))
    expect(inDialog('replace-audio-confirm')?.hasAttribute('disabled')).toBe(true)
  })

  it('shows the file picked, in the drop zone\'s place, until another one is chosen', async () => {
    await mountDialog(track(false))
    // The drop zone's file input, given a file as the browser would.
    const input = document.body.querySelector<HTMLInputElement>('input[type="file"]')!
    // A 2 kB FLAC "master".
    const file = new File([new Uint8Array(2048)], 'Montgisard (master).flac', { type: 'audio/flac' })
    Object.defineProperty(input, 'files', { value: [file] })
    input.dispatchEvent(new Event('change'))
    await nextTick()
    await nextTick()

    // Its name, format and size, and Replace ready.
    expect(inDialog('replace-audio-dropzone')).toBeNull()
    expect(inDialog('replace-audio-file')?.textContent).toContain('Montgisard (master).flac')
    expect(inDialog('replace-audio-file')?.textContent).toContain('FLAC')
    expect(inDialog('replace-audio-confirm')?.hasAttribute('disabled')).toBe(false)

    // ✕ brings the drop zone back, and Replace waits again.
    inDialog('replace-audio-file')!.querySelector<HTMLButtonElement>('button')!.click()
    await nextTick()
    expect(inDialog('replace-audio-dropzone')).not.toBeNull()
    expect(inDialog('replace-audio-confirm')?.hasAttribute('disabled')).toBe(true)
  })
})
