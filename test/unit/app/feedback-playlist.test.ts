/**
 * Name of the "Share for feedback" playlist (app/lib/feedback-playlist.ts):
 * the versions' common title, without dangling version markers; and the song
 * a group is about, which tells the likely versions of it.
 */
import { describe, expect, it } from 'vitest'
import { feedbackPlaylistTitle, groupSongName, isVersionOf } from '~/lib/feedback-playlist'

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

describe('groupSongName', () => {
  it('drops the suffix "Share for feedback" adds', () => {
    expect(groupSongName('Night drive – versions')).toBe('Night drive')
    expect(groupSongName('Night drive – Versions ')).toBe('Night drive')
  })

  it('keeps a title renamed without it', () => {
    expect(groupSongName('La compagnia del Ciufolo')).toBe('La compagnia del Ciufolo')
  })
})

describe('isVersionOf', () => {
  const group = 'La compagnia del Ciufolo – versions'

  it('takes titles that start with the song, whatever follows', () => {
    for (const title of ['La compagnia del Ciufolo', 'La Compagnia del Ciufolo - 2', 'la compagnia del ciufolo (Cover)', 'La compagnia del Ciufolo2', 'La compagnia del Ciufolo, take 3']) {
      expect(isVersionOf(title, group)).toBe(true)
    }
  })

  it('leaves out a longer word and another song', () => {
    expect(isVersionOf('La compagnia del Ciufolone', group)).toBe(false)
    expect(isVersionOf('Il Ciufolo', group)).toBe(false)
    expect(isVersionOf('La compagnia', group)).toBe(false)
  })

  it('lets a name ending in a sign be followed by anything', () => {
    expect(isVersionOf('Rain (acoustic', 'Rain ( – versions')).toBe(true)
  })

  it('matches nothing for an empty name', () => {
    expect(isVersionOf('Anything', '')).toBe(false)
  })
})
