import {
  setMediaSessionHandlers,
  setMediaSessionPlaybackState,
  setMediaSessionPosition,
  setMediaSessionTrack,
} from '~/lib/media-session'

/** Connects the player store to the operating system's Media Session. */
export default defineNuxtPlugin(() => {
  const player = usePlayerStore()

  setMediaSessionHandlers({
    play: () => void player.play(),
    pause: () => player.pause(),
    stop: () => player.stop(),
    previous: () => void player.previous(),
    next: () => void player.next(),
    seekTo: seconds => player.seek(seconds),
  })

  watch(() => player.current, (track) => {
    setMediaSessionTrack(track
      ? { title: track.title, artist: track.composers, album: track.album, artworkUrl: track.coverUrl }
      : null)
  })

  watch(() => player.status, (status) => {
    setMediaSessionPlaybackState(status === 'playing' ? 'playing' : status === 'idle' ? 'none' : 'paused')
    setMediaSessionPosition(player.duration, player.currentTime, player.playbackRate)
  })

  // The position feeds the lock-screen progress bar: updating it every few seconds
  // (and whenever the speed changes) is enough.
  watch([() => Math.floor(player.currentTime / 5), () => player.playbackRate], () => {
    setMediaSessionPosition(player.duration, player.currentTime, player.playbackRate)
  })
})
