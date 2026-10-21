/**
 * Name of the "Share for feedback" playlist (app/lib/feedback-playlist.ts):
 * the versions' common title, without dangling version markers.
 */
import { describe, expect, it } from 'vitest'
import { feedbackPlaylistTitle } from '~/lib/feedback-playlist'

describe('feedbackPlaylistTitle', () => {
  it('uses the common title of the versions', () => {
    expect(feedbackPlaylistTitle(['Night drive v1', 'Night drive v2', 'Night drive v3'])).toBe('Night drive – versions')
    expect(feedbackPlaylistTitle(['Rain (acoustic)', 'Rain (piano)'])).toBe('Rain – versions')
    expect(feedbackPlaylistTitle(['Neon - take 1', 'neon - TAKE 2'])).toBe('Neon – versions')
  })

  it('falls back to the first title when the versions share nothing useful', () => {
    expect(feedbackPlaylistTitle(['Night drive', 'Something else'])).toBe('Night drive – versions')
    expect(feedbackPlaylistTitle(['Solo'])).toBe('Solo – versions')
  })

  it('stays within the playlist title limit', () => {
    expect(feedbackPlaylistTitle(['x'.repeat(300)]).length).toBe(200)
  })
})
