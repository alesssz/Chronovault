<script setup lang="ts">
import { getAudioEngine } from '~/lib/audio-engine'

/**
 * Cast button: sends the music to a TV or speaker on the Wi-Fi network
 * (Chromecast / Google TV from Android, AirPlay from iPhone and iPad), see
 * useRemotePlayback. Shown in the player bar (from tablet width) and in the
 * full-screen view's top bar (the phones' way to reach it).
 *
 * Where it shows:
 * - on touch screens (phones, tablets) always, as in phone music apps: a tap
 *   opens the browser's picker, which searches the network then; when it
 *   finds nothing, or the browser cannot cast at all (e.g. Opera on Android,
 *   or Firefox), a message says so and what to try;
 * - with a mouse only when the browser reports a device (or cannot tell
 *   until asked), as video sites do on a desktop, where most people have
 *   nothing to cast to.
 * While casting (or connecting) it shows everywhere, in the primary colour;
 * pressing it again opens the browser's picker, where casting can be
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
// "No devices found" / "cannot cast" / failure messages.
const toast = useToast()

/** A touch screen (phone, tablet): the button is always there. */
const touch = useMediaQuery('(pointer: coarse)')
/** Shown: always on touch screens, otherwise when a device is around; and always while connected. */
const visible = computed(() => touch.value || available.value || state.value !== 'disconnected')

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
  else if (result === 'unsupported') {
    toast.add({
      title: 'This browser cannot cast',
      description: 'To play on a TV or speaker, open ChronoPlayer in Chrome (Android) or Safari (iPhone, iPad).',
      icon: 'i-lucide-cast',
      color: 'warning',
      duration: 8000,
    })
  }
  else if (result === 'failed') {
    toast.add({ title: 'Could not start casting', icon: 'i-lucide-cast', color: 'error' })
  }
}
</script>

<template>
  <!-- Always on touch screens; with a mouse, hidden until a device can be offered; kept while connected, to stop casting. -->
  <IconButton
    v-if="visible"
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
