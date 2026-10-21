import type { QueueItem, QueueResult } from '~/stores/player'

/**
 * "Play next" and "Add to queue" for track menus (library, playlist page),
 * with a toast telling what happened. When nothing from the library is
 * playing, both simply start the track.
 */
export function useQueueActions() {
  const player = usePlayerStore()
  const toast = useToast()

  const messages: Record<QueueResult, (title: string) => { title: string, icon: string }> = {
    'started': title => ({ title: `Playing ${title}`, icon: 'i-lucide-play' }),
    'queued': title => ({ title: `${title} added to the queue`, icon: 'i-lucide-list-end' }),
    'current': title => ({ title: `${title} is already playing`, icon: 'i-lucide-audio-lines' }),
    'already-queued': title => ({ title: `${title} is already in the queue`, icon: 'i-lucide-list-checks' }),
  }

  function notify(result: QueueResult, track: QueueItem, nextLabel: boolean) {
    const message = messages[result](track.title)
    // "Play next" says where the track went.
    if (result === 'queued' && nextLabel) message.title = `${track.title} plays next`
    toast.add({ ...message, color: result === 'queued' ? 'success' : 'neutral', duration: 2500 })
  }

  async function playNext(track: QueueItem): Promise<void> {
    notify(await player.playNext(track), track, true)
  }

  async function addToQueue(track: QueueItem): Promise<void> {
    notify(await player.addToQueue(track), track, false)
  }

  return { playNext, addToQueue }
}
