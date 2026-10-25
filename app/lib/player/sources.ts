/**
 * Where the player gets track data and streaming URLs from: the user's own
 * library (signed in), or a link shared with anyone (public track and
 * playlist pages). The queue and playback logic is the same for all of them;
 * only these two lookups differ.
 */
import type { PlaybackSource, SharedTrack } from '~~/shared/types/track'
import type { SharedPlaylist } from '~~/shared/types/playlist'
import { sharedApi, tracksApi } from '~/services/api'
import type { PlayerTrack } from './types'

/** Where the player gets track data and streaming URLs from. */
export interface TrackSource {
  /** Identifies the source: 'library', 'track:<id>' or 'playlist:<id>'. */
  key: string
  /** The track's full data (the owner's detail, or the shared fields). */
  get: (id: string) => Promise<PlayerTrack>
  /** A fresh streaming address of the track. */
  playback: (id: string) => Promise<PlaybackSource>
}

/** The user's own library (sign-in required). */
export const librarySource: TrackSource = { key: 'library', get: tracksApi.get, playback: tracksApi.playback }

/** A track shared by link: its data is already known, audio URLs come from the public API. */
export function sharedTrackSource(track: SharedTrack): TrackSource {
  return { key: `track:${track.id}`, get: async () => track, playback: sharedApi.playback }
}

/** A shared playlist: track data is already known, audio URLs are signed through the playlist. */
export function sharedPlaylistSource(playlist: SharedPlaylist): TrackSource {
  return {
    key: `playlist:${playlist.id}`,
    get: async (id) => {
      // The track, from the playlist already loaded on the page (no request).
      const track = playlist.tracks.find(t => t.id === id)
      if (!track) throw new Error('Track not found in the playlist')
      return track
    },
    playback: id => sharedApi.playlistTrackPlayback(playlist.id, id),
  }
}
