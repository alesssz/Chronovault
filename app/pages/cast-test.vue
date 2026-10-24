<script setup lang="ts">
import { tracksApi } from '~/services/api'
import { castErrorText, loadGoogleCast, type GoogleCast } from '~/lib/google-cast'

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
 * Results so far (Chrome on Android, TCL Google TV on, same Wi-Fi): no row
 * ever saw a device; only the <video> rows opened Chrome's picker, which
 * searched and found nothing, while Chrome's own "Cast…" menu lists the TV.
 * So row F tries the other way, the Google Cast Web Sender SDK
 * (lib/google-cast), which goes through the same route as that menu, with
 * Google's default receiver (free, shows title and artwork): connect, then
 * send the track (its streaming address, FLAC from R2 behind a redirect) or
 * the static WAV, and read the device's player state in the log. The two
 * sends tell a format or storage problem from a casting one.
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

/** The track used by A–C and F: the library's first one. */
const track = ref<{ title: string, artist: string, url: string, mimeType: string } | null>(null)
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
    const [detail, playback] = await Promise.all([tracksApi.get(first.id), tracksApi.playback(first.id)])
    track.value = { title: first.title, artist: first.composers ?? '', url: playback.url, mimeType: detail.mimeType }
    // A: detached, exactly like the app's audio engine (new Audio(), never added to the page).
    const detached = new Audio()
    detached.preload = 'metadata'
    detached.src = track.value.url
    follow('A', detached)
  }
  catch (error) {
    trackError.value = describe(error)
  }
  void startGoogleCast()
})

// --- F. Google Cast Web Sender SDK ---------------------------------------------------------

/** The SDK once loaded, or null (not yet, or not available in this browser). */
const sdk = shallowRef<GoogleCast | null>(null)
/** Loading state of the SDK, or why it is not available. */
const sdkStatus = ref('loading…')
/** The SDK's connection state: NO_DEVICES_AVAILABLE, NOT_CONNECTED, CONNECTING, CONNECTED. */
const castState = ref('-')
/** What happened in row F, oldest first, each line with the seconds since the page opened. */
const sdkLog = ref<string[]>([])

/** Adds a line to row F's log. */
function log(line: string) {
  sdkLog.value = [...sdkLog.value, `${(performance.now() / 1000).toFixed(1)} s · ${line}`]
}

/** Loads the SDK and sets it up with Google's default receiver. */
async function startGoogleCast() {
  const { cast, reason } = await loadGoogleCast()
  if (!cast) {
    sdkStatus.value = `not available: ${reason}`
    return
  }
  cast.context.setOptions({ receiverApplicationId: cast.DEFAULT_MEDIA_RECEIVER_APP_ID, autoJoinPolicy: cast.ORIGIN_SCOPED })
  castState.value = cast.context.getCastState()
  cast.context.addEventListener(cast.CastContextEventType.CAST_STATE_CHANGED, (event) => {
    castState.value = event.castState ?? '-'
    log(`cast state: ${castState.value}`)
  })
  cast.context.addEventListener(cast.CastContextEventType.SESSION_STATE_CHANGED, (event) => {
    log(`session state: ${event.sessionState ?? '-'}`)
  })
  sdk.value = cast
  sdkStatus.value = 'ready (default receiver)'
}

/** "Connect": opens Google Cast's device picker (from the click). */
async function connect() {
  const cast = sdk.value
  if (!cast) return log('connect: the SDK is not available')
  const startedAt = performance.now()
  try {
    await cast.context.requestSession()
    const device = cast.context.getCurrentSession()?.getCastDevice().friendlyName ?? '?'
    log(`connected to "${device}" (${Math.round(performance.now() - startedAt)} ms)`)
  }
  catch (error) {
    log(`connect refused: ${castErrorText(error)} (${Math.round(performance.now() - startedAt)} ms)`)
  }
}

/**
 * "Play … on TV": sends the track or the static WAV to the connected device,
 * with title, artist and the app icon, then logs the device's player state
 * for 20 seconds (BUFFERING → PLAYING, or IDLE with a reason such as ERROR).
 */
async function sendToTv(what: 'track' | 'static') {
  const cast = sdk.value
  const session = cast?.context.getCurrentSession()
  if (!cast || !session) return log('send: connect to a TV first')
  if (what === 'track' && !track.value) return log('send: no track loaded')

  // Absolute addresses: the TV fetches them itself.
  const url = new URL(what === 'track' ? track.value!.url : STATIC_URL, window.location.origin).href
  const contentType = what === 'track' ? track.value!.mimeType : 'audio/wav'
  const media = new cast.MediaInfo(url, contentType)
  media.contentUrl = url
  media.streamType = 'BUFFERED'
  const metadata = new cast.MusicTrackMediaMetadata()
  metadata.title = what === 'track' ? track.value!.title : 'ChronoPlayer cast test (WAV)'
  metadata.artist = what === 'track' ? track.value!.artist : 'ChronoPlayer'
  metadata.images = [new cast.Image(new URL('/pwa-512x512.png', window.location.origin).href)]
  media.metadata = metadata

  log(`send ${what}: ${contentType}`)
  try {
    await session.loadMedia(new cast.LoadRequest(media))
    log(`send ${what}: accepted by the TV`)
  }
  catch (error) {
    log(`send ${what}: refused: ${castErrorText(error)}`)
    return
  }
  // The device's player state, logged when it changes, for 20 s.
  let last = ''
  for (let second = 0; second < 20; second++) {
    const state = session.getMediaSession()
    const now = state ? `${state.playerState}${state.idleReason ? ` (${state.idleReason})` : ''}` : 'no media session'
    if (now !== last) log(`TV player: ${now}`)
    last = now
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
}

/** "Stop": ends the session and the playback on the TV. */
function stopCasting() {
  sdk.value?.context.endCurrentSession(true)
  log('stop')
}

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
  `F. Google Cast SDK | ${sdkStatus.value} | ${castState.value}`,
  ...sdkLog.value.map(line => `   ${line}`),
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
        press play on its player first (B–E have controls), then Cast again. In row F, connect
        to the TV, then play the track (or the test WAV). Then "Copy results".
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

    <!--
      F: the Google Cast SDK, the route of Chrome's own "Cast…" menu. Connect first (Google's
      picker), then send the track or the static WAV; the log shows what the TV answers.
    -->
    <div
      class="space-y-3 rounded-lg border border-default p-3"
      data-testid="cast-test-F"
    >
      <p class="font-semibold">
        F. Google Cast SDK (as Chrome's "Cast…" menu)
      </p>
      <dl class="grid grid-cols-[auto_1fr] gap-x-3 text-sm">
        <dt class="text-muted">
          SDK
        </dt>
        <dd>{{ sdkStatus }}</dd>
        <dt class="text-muted">
          State
        </dt>
        <dd>{{ castState }}</dd>
      </dl>
      <div class="flex flex-wrap gap-2">
        <UButton
          icon="i-lucide-cast"
          label="1. Connect to a TV"
          size="sm"
          data-testid="cast-test-F-connect"
          @click="connect"
        />
        <UButton
          icon="i-lucide-music"
          label="2. Play the track on the TV"
          size="sm"
          color="neutral"
          variant="subtle"
          @click="sendToTv('track')"
        />
        <UButton
          icon="i-lucide-audio-waveform"
          label="Or: play the test WAV"
          size="sm"
          color="neutral"
          variant="subtle"
          @click="sendToTv('static')"
        />
        <UButton
          icon="i-lucide-square"
          label="Stop"
          size="sm"
          color="neutral"
          variant="ghost"
          @click="stopCasting"
        />
      </div>
      <ol
        v-if="sdkLog.length"
        class="space-y-0.5 font-mono text-xs text-muted"
      >
        <li
          v-for="(line, i) in sdkLog"
          :key="i"
        >
          {{ line }}
        </li>
      </ol>
    </div>

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
