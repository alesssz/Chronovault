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
 *   finds nothing, or the browser refuses (e.g. Opera on Android, Firefox),
 *   a message says so, with the browser's own answer;
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

/**
 * Opens the device picker, and explains when it finds nothing or fails.
 * When the browser refuses, its own answer is shown too ("Browser's
 * answer: …"): casting cannot be tried from a test browser, and on a real
 * phone that text is what tells why (a source it will not cast, casting
 * switched off in an installed app, a browser without it…).
 */
async function cast() {
  const { result, detail } = await prompt()
  /** The browser's answer, appended to the explanation when there is one. */
  const answer = detail ? ` Browser's answer: ${detail}.` : ''
  if (result === 'no-devices') {
    toast.add({
      title: 'No devices found',
      description: 'Turn on the TV or speaker and check that it is on the same Wi-Fi network as this device.',
      icon: 'i-lucide-cast',
      color: 'warning',
    })
  }
  else if (result === 'unsupported') {
    // Not "this browser cannot cast": Chrome itself may refuse a particular audio or
    // context (seen in Chrome's installed app), so the wording stays to what is known.
    toast.add({
      title: 'Casting is not available here',
      description: `The browser did not offer to cast this audio. Chrome (Android) and Safari (iPhone, iPad) usually can.${answer}`,
      icon: 'i-lucide-cast',
      color: 'warning',
      duration: 15000,
    })
  }
  else if (result === 'failed') {
    toast.add({
      title: 'Could not start casting',
      description: answer.trim() || undefined,
      icon: 'i-lucide-cast',
      color: 'error',
      duration: 15000,
    })
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
