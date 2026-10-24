<script setup lang="ts">
import { tracksApi } from '~/services/api'

/**
 * TEMPORARY diagnostic page (`/cast-test`, linked from nowhere): why does
 * Chrome on Android refuse to cast the player's audio ("NotAllowedError: The
 * prompt was dismissed", in about 10 ms, with a Chromecast built-in TV on the
 * same Wi-Fi)? The app's streaming address (HEAD answered, GET redirected)
 * did not change it, and Chrome sent no HEAD at all when Cast was pressed.
 *
 * Each row is one variant of what could matter, with its own Cast button:
 *   A. the track, in a detached `new Audio()` (what the app's player does);
 *   B. the track, in an <audio> placed in the page;
 *   C. the track, in a <video> placed in the page;
 *   D. a static WAV served by the site (plain address: no signature, no
 *      redirect, no FLAC), in an <audio> placed in the page;
 *   E. the same WAV in a <video>.
 * Which rows open Chrome's device picker tells whether the cause is the
 * element (detached, or audio rather than video), the address or the format.
 * Every row shows what the browser reports: whether a device is available
 * (watchAvailability), how far the media has loaded (readyState), and the
 * answer to the last tap, with how long it took. "Copy results" puts it all
 * on the clipboard, to paste into a message.
 *
 * Remove the page and public/cast-test.wav once casting works.
 */

/** One variant under test. */
interface Variant {
  id: 'A' | 'B' | 'C' | 'D' | 'E'
  label: string
  kind: 'audio' | 'video'
  /** Placed in the page (B–E) or a detached element (A). */
  attached: boolean
  /** The library's first track (streaming address) or the static WAV. */
  source: 'track' | 'static'
}

const VARIANTS: Variant[] = [
  { id: 'A', label: 'Track · detached new Audio() (as the player)', kind: 'audio', attached: false, source: 'track' },
  { id: 'B', label: 'Track · <audio> in the page', kind: 'audio', attached: true, source: 'track' },
  { id: 'C', label: 'Track · <video> in the page', kind: 'video', attached: true, source: 'track' },
  { id: 'D', label: 'Static WAV · <audio> in the page', kind: 'audio', attached: true, source: 'static' },
  { id: 'E', label: 'Static WAV · <video> in the page', kind: 'video', attached: true, source: 'static' },
]

/** The static test file (public/cast-test.wav: 10 s of a 440 Hz tone). */
const STATIC_URL = '/cast-test.wav'

/** What each variant reports, shown in its row and copied with the results. */
interface Report {
  availability: string
  readyState: string
  answer: string
}
const reports = reactive<Record<Variant['id'], Report>>(Object.fromEntries(
  VARIANTS.map(v => [v.id, { availability: 'not watched yet', readyState: '-', answer: 'not tried' }]),
) as Record<Variant['id'], Report>)

/** The browser's user agent, read after mount (the server has none, and both renders must agree). */
const userAgent = ref('')

/** The track used by A–C: the library's first one. */
const track = ref<{ title: string, url: string } | null>(null)
/** Why the track could not be loaded, if it could not. */
const trackError = ref<string | null>(null)

/** The media element of each variant (A's is created in code, the others come from the template). */
const elements: Partial<Record<Variant['id'], HTMLMediaElement>> = {}

/** Names of HTMLMediaElement.readyState values, for the report. */
const READY_STATES = ['HAVE_NOTHING', 'HAVE_METADATA', 'HAVE_CURRENT_DATA', 'HAVE_FUTURE_DATA', 'HAVE_ENOUGH_DATA']

/** Starts following a variant's element: device availability and loading state. */
function follow(id: Variant['id'], element: HTMLMediaElement) {
  elements[id] = element
  const report = reports[id]
  const updateReady = () => {
    report.readyState = `${READY_STATES[element.readyState] ?? element.readyState}${element.error ? ` · error ${element.error.code}` : ''}`
  }
  for (const event of ['loadedmetadata', 'canplay', 'error', 'emptied']) element.addEventListener(event, updateReady)
  updateReady()
  if (!('remote' in element)) {
    report.availability = 'no Remote Playback API'
    return
  }
  element.remote.watchAvailability((available) => {
    report.availability = available ? 'device available' : 'no device'
  }).catch((error: unknown) => {
    report.availability = `watch refused: ${describe(error)}`
  })
}

/** "Name: message" of a browser error. */
function describe(error: unknown): string {
  if (error instanceof Error) return `${error.name}${error.message ? `: ${error.message}` : ''}`
  return String(error)
}

/** Template ref callback of B–E: follows each element once, when it appears. */
function register(id: Variant['id'], element: unknown) {
  if (element instanceof HTMLMediaElement && elements[id] !== element) follow(id, element)
}

/** The address a variant plays. */
function sourceOf(variant: Variant): string | undefined {
  return variant.source === 'static' ? STATIC_URL : track.value?.url
}

onMounted(async () => {
  userAgent.value = navigator.userAgent
  try {
    const [first] = await tracksApi.list()
    if (!first) {
      trackError.value = 'The library is empty: upload a track to test A–C.'
      return
    }
    track.value = { title: first.title, url: (await tracksApi.playback(first.id)).url }
    // A: detached, exactly like the app's audio engine (new Audio(), never added to the page).
    const detached = new Audio()
    detached.preload = 'metadata'
    detached.src = track.value.url
    follow('A', detached)
  }
  catch (error) {
    trackError.value = describe(error)
  }
})

/** Taps a variant's Cast button: asks the browser for its device picker and records the answer. */
async function cast(variant: Variant) {
  const element = elements[variant.id]
  const report = reports[variant.id]
  if (!element) {
    report.answer = 'element not ready'
    return
  }
  if (!('remote' in element)) {
    report.answer = 'no Remote Playback API'
    return
  }
  const startedAt = performance.now()
  try {
    await element.remote.prompt()
    report.answer = `picker opened, device chosen (${Math.round(performance.now() - startedAt)} ms)`
  }
  catch (error) {
    report.answer = `${describe(error)} (${Math.round(performance.now() - startedAt)} ms)`
  }
}

/** Everything on the page as text, for a message. */
const summary = computed(() => [
  `User agent: ${userAgent.value}`,
  `Track: ${track.value?.title ?? trackError.value ?? 'loading'}`,
  ...VARIANTS.map(v => `${v.id}. ${v.label} | ${reports[v.id].availability} | ${reports[v.id].readyState} | ${reports[v.id].answer}`),
].join('\n'))

/** "Copy results": the summary on the clipboard. */
const toast = useToast()
async function copyResults() {
  const copied = await copyText(summary.value)
  toast.add({ title: copied ? 'Results copied' : 'Could not copy: select the text below', color: copied ? 'success' : 'warning' })
}
</script>

<template>
  <UContainer class="space-y-6 py-6">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight">
        Cast test
      </h1>
      <p class="mt-1 text-sm text-muted">
        Tap Cast on each row and note which ones open Chrome's device picker. If a row refuses,
        press play on its player first (B–E have controls), then Cast again. Then "Copy results".
      </p>
      <p
        v-if="trackError"
        class="mt-2 text-sm text-error"
      >
        {{ trackError }}
      </p>
    </div>

    <!-- One card per variant: what it is, its player (B–E), what the browser reports, and its Cast button -->
    <ul class="space-y-4">
      <li
        v-for="variant in VARIANTS"
        :key="variant.id"
        class="space-y-2 rounded-lg border border-default p-3"
        :data-testid="`cast-test-${variant.id}`"
      >
        <p class="font-semibold">
          {{ variant.id }}. {{ variant.label }}
        </p>
        <template v-if="variant.attached && sourceOf(variant)">
          <audio
            v-if="variant.kind === 'audio'"
            :ref="el => register(variant.id, el)"
            :src="sourceOf(variant)"
            preload="metadata"
            controls
            class="w-full"
          />
          <video
            v-else
            :ref="el => register(variant.id, el)"
            :src="sourceOf(variant)"
            preload="metadata"
            controls
            playsinline
            class="h-16 w-full"
          />
        </template>
        <dl class="grid grid-cols-[auto_1fr] gap-x-3 text-sm">
          <dt class="text-muted">
            Devices
          </dt>
          <dd>{{ reports[variant.id].availability }}</dd>
          <dt class="text-muted">
            Loaded
          </dt>
          <dd>{{ reports[variant.id].readyState }}</dd>
          <dt class="text-muted">
            Answer
          </dt>
          <dd class="break-words">
            {{ reports[variant.id].answer }}
          </dd>
        </dl>
        <UButton
          icon="i-lucide-cast"
          label="Cast"
          size="sm"
          :data-testid="`cast-test-${variant.id}-button`"
          @click="cast(variant)"
        />
      </li>
    </ul>

    <!-- The results as text, also copyable, to paste into a message -->
    <div class="space-y-2">
      <UButton
        icon="i-lucide-copy"
        label="Copy results"
        color="neutral"
        variant="subtle"
        @click="copyResults"
      />
      <pre class="overflow-x-auto whitespace-pre-wrap rounded-lg bg-elevated p-3 text-xs">{{ summary }}</pre>
    </div>
  </UContainer>
</template>
