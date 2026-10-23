<script setup lang="ts">
import { getAudioEngine } from '~/lib/audio-engine'

/**
 * Cast button: sends the music to a TV or speaker on the Wi-Fi network
 * (Chromecast / Google TV from Android, AirPlay from iPhone and iPad), see
 * useRemotePlayback. Shown in the player bar (from tablet width) and in the
 * full-screen view's top bar (the phones' way to reach it).
 *
 * It only appears where it can do something: the browser supports casting
 * and a device can be offered. While casting the icon turns the primary
 * colour; pressing it again opens the browser's picker, where casting can be
 * stopped or moved to another device.
 *
 * The element cast is the app's single <audio> (lib/audio-engine), taken
 * after mount: there is no audio element on the server.
 */
const element = shallowRef<HTMLMediaElement | null>(null)
onMounted(() => {
  element.value = getAudioEngine().element
})

const { available, state, prompt } = useRemotePlayback(element)
// "No devices found" / failure messages.
const toast = useToast()

/** Accessible name and tooltip: what pressing it will do now. */
const label = computed(() => {
  if (state.value === 'connected') return 'Casting: stop or change device'
  if (state.value === 'connecting') return 'Connecting to the device…'
  return 'Cast to a device'
})

/** Opens the device picker, and explains when it finds nothing or fails. */
async function cast() {
  const result = await prompt()
  if (result === 'no-devices') {
    toast.add({
      title: 'No devices found',
      description: 'Turn on the TV or speaker and check that it is on the same Wi-Fi network as this device.',
      icon: 'i-lucide-cast',
      color: 'warning',
    })
  }
  else if (result === 'failed') {
    toast.add({ title: 'Could not start casting', icon: 'i-lucide-cast', color: 'error' })
  }
}
</script>

<template>
  <!-- Hidden until a device can be offered; kept while connected, to stop casting. -->
  <IconButton
    v-if="available || state !== 'disconnected'"
    icon="i-lucide-cast"
    :color="state === 'disconnected' ? 'neutral' : 'primary'"
    variant="ghost"
    :label="label"
    :loading="state === 'connecting'"
    :data-state="state"
    data-testid="player-cast"
    @click="cast"
  />
</template>
