<script setup lang="ts">
import { ariaShortcut } from '~/lib/keyboard-shortcuts'
import { STORAGE_KEYS } from '~/lib/storage-keys'

/**
 * Full-screen player: cover, waveform, controls and synced lyrics.
 * It is just a different view of the same store: opening or closing it
 * never interrupts playback.
 *
 * On touch screens it can be pulled down to close (useSwipeToDismiss): the
 * view follows the finger and the dimmed page shows behind it. For that the
 * modal's own panel is transparent and this component's root paints the
 * background, so moving the root moves the whole visible view. Elements that
 * handle dragging themselves (waveform, volume slider, lyrics) are marked
 * `data-swipe-ignore`. The Android back button collapses it too.
 *
 * Layouts:
 * - tablets and desktops (`md` and up): two columns, cover, info, waveform
 *   and controls on the left, the lyrics on the right. A track without
 *   lyrics shows its description there instead ("About this track", as on
 *   phones); with neither, the left column stands alone, centred, instead of
 *   beside a half screen holding only "No lyrics";
 * - phones, normal view: one scrolling column, cover, info, waveform and
 *   controls, then the track's description when it has one. The lyrics are
 *   not under the controls any more: there they could never fill the
 *   screen, and their auto-scroll moved the whole view;
 * - phones, lyrics view: the "Lyrics" button of the top bar (shown when the
 *   track has lyrics) swaps the column for a small cover and title on top,
 *   the lyrics filling the screen in their own scrolling box and one size
 *   bigger, and the waveform with previous / play / next at the bottom, so
 *   the controls stay at hand. The choice is remembered on the device; a
 *   track without lyrics simply shows the normal view. While the lyrics view
 *   is open and the music plays, the screen stays on (Screen Wake Lock), so
 *   the phone does not dim and lock while someone follows the words.
 *
 * Shared pages: the public layout mounts it too (`shared`), so visitors of a
 * share link get the same view, opened from their page's player. There the
 * owner's tools stay out: no "Edit track", no hint to add lyrics to a track
 * without any (LyricsView's `shared`), and the genre comes with the
 * shared track itself (the genre list is the signed-in owner's: asking for
 * it would only fail). Up next, shuffle and repeat already hide themselves
 * outside library playback (`queueEditable`).
 *
 * Focus on opening: the modal moves the focus into the view, and by default
 * onto its first button, "Collapse player", whose tooltip then opened by
 * itself (tooltips open on focus) and covered the cover. The view's own
 * root takes the focus instead (`tabindex="-1"`, see onOpenAutoFocus): it is
 * still inside the dialog for keyboards and screen readers, on no button.
 */
const props = withDefaults(defineProps<{
  /** Mounted by a share page's layout: a visitor's view (see the file comment). */
  shared?: boolean
}>(), { shared: false })

// The view only shows the store's state and calls its commands.
const player = usePlayerStore()
// The owner's genre names, for the meta line. Not on share pages: the list
// needs a signed-in user (the request would answer 401, during server
// rendering too), and shared tracks carry their genre's name instead.
const genres = props.shared ? null : useGenres()

/** The modal is bound to the store, so any component can open or close the view. */
const open = computed({
  get: () => player.expanded,
  set: value => player.setExpanded(value),
})

/** The view's root: the pull-down moves it. */
const view = ref<HTMLElement | null>(null)
/** The view's scrolling area (phones): the pull-down starts only at its top. */
const scroller = ref<HTMLElement | null>(null)

/** Pull down to close, on touch screens. */
const swipe = useSwipeToDismiss(view, {
  scroller,
  onDismiss: () => {
    open.value = false
  },
})
// Every opening starts at rest (a pull-down that closed the view leaves its offset behind).
watch(open, (value) => {
  if (value) swipe.reset()
})

/**
 * Style of the root while pulled: moved down by the finger, with no
 * transition while dragging (it must stick to the finger) and a short one on
 * release (the spring back).
 */
const viewStyle = computed(() => ({
  transform: swipe.offset.value ? `translateY(${swipe.offset.value}px)` : undefined,
  transition: swipe.dragging.value ? 'none' : 'transform 200ms ease-out',
}))

/** Below `md` (48rem = 768px): the one-column phone layouts. */
const isPhone = useMediaQuery('(width < 48rem)')
/** The track has lyrics to show (synced or plain): the Lyrics button appears. */
const hasLyrics = computed(() => !!(player.current?.lyricsSynced?.length || player.current?.lyrics?.trim()))
/** Phones: the lyrics view was chosen, remembered on this device like the volume. */
const lyricsChosen = useLocalStorage(STORAGE_KEYS.lyricsView, false)
/** The phones' lyrics view is showing: chosen, on a phone, for a track that has lyrics. */
const lyricsView = computed(() => isPhone.value && hasLyrics.value && lyricsChosen.value)
/**
 * The track's description ('' when there is none): under the controls in the phones' normal
 * view, in the right column from `md` when the track has no lyrics.
 */
const description = computed(() => player.current?.description?.trim() ?? '')
/** From `md`, the right column has something to hold: the lyrics, or else the description. */
const twoColumns = computed(() => hasLyrics.value || !!description.value)

// --- Screen kept on in the lyrics view ------------------------------------------------
// Reading along means not touching the phone, which would otherwise dim and lock after
// its usual timeout. Only while the lyrics view is open and the music plays: paused, or
// back on the cover, the screen behaves as usual again. VueUse's useWakeLock asks for it
// again when the page returns to the foreground and lets it go when the view unmounts.
const wakeLock = useWakeLock()
/** The lyrics view is being read along with the music. */
const readingAlong = computed(() => open.value && lyricsView.value && player.isPlaying)
// The screen stays on while reading along, and may sleep again after.
watch(readingAlong, (on) => {
  if (!wakeLock.isSupported.value) return
  // Refusals are fine (e.g. battery saver): the screen just behaves as usual.
  if (on) wakeLock.request('screen').catch(() => {})
  else wakeLock.release().catch(() => {})
}, { immediate: true })

/**
 * The modal is opening and is about to focus its first focusable element
 * (the "Collapse player" button, whose tooltip would then show by itself):
 * the view's root takes the focus instead, still inside the dialog.
 */
function onOpenAutoFocus(event: Event) {
  event.preventDefault()
  view.value?.focus()
}

// The Android back button collapses the view instead of leaving the page (see useCloseOnBack).
useCloseOnBack(open, () => {
  open.value = false
})

// Slightly smaller base scale while the full-screen view is open (see main.css).
useHead({ htmlAttrs: { class: computed(() => (open.value ? 'player-expanded' : '')) } })

/** What the view shows (the queued summary while the full data loads). */
const track = computed(() => player.displayTrack)
/** "Album · Year · Genre" line (only the parts that are set; a shared track names its genre itself). */
const meta = computed(() => {
  // The loaded track's full data (none while it loads).
  const t = player.current
  return t ? joinParts([t.album, t.year, t.genre ?? genres?.genreName(t.genreId) ?? null]) : ''
})
</script>

<template>
  <UModal
    v-model:open="open"
    fullscreen
    title="Player"
    description="Now playing"
    :ui="{ content: 'bg-transparent shadow-none ring-0' }"
    :content="{ onOpenAutoFocus }"
  >
    <template #content>
      <!--
        The view itself: it paints the background, so the pull-down moves all of it (rounded while
        pulled). `tabindex="-1"`: it takes the focus when the view opens (see onOpenAutoFocus),
        without being a tab stop. `data-player-shortcuts`: a dialog, yet the player's keyboard
        shortcuts work in it (app/lib/keyboard-shortcuts.ts).
      -->
      <div
        ref="view"
        tabindex="-1"
        class="flex h-full flex-col bg-default outline-none"
        :class="{ 'rounded-t-2xl': swipe.offset.value > 0 }"
        :style="viewStyle"
        data-player-shortcuts
        data-testid="player-expanded"
      >
        <!-- Top bar: collapse, title, Cast (when a device is around), Up next and edit buttons (the last two: library only) -->
        <header class="flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top),1rem)] pb-2">
          <IconButton
            icon="i-lucide-chevron-down"
            color="neutral"
            variant="ghost"
            label="Collapse player"
            :aria-keyshortcuts="ariaShortcut('full-screen')"
            @click="open = false"
          />
          <span class="text-xs font-medium uppercase tracking-widest text-muted">Now playing</span>
          <div class="flex items-center">
            <!-- Phones: lyrics view on / off (only when the track has lyrics; the wider layouts always show them) -->
            <IconButton
              v-if="isPhone && hasLyrics"
              icon="i-lucide-mic-vocal"
              :color="lyricsView ? 'primary' : 'neutral'"
              variant="ghost"
              :label="lyricsView ? 'Hide lyrics' : 'Show lyrics'"
              :aria-pressed="lyricsView"
              data-testid="player-lyrics-toggle"
              @click="lyricsChosen = !lyricsChosen"
            />
            <!-- Cast to a TV or speaker (the phones' way to reach it: their player bar has no room) -->
            <PlayerCastButton />
            <!-- The queue panel opens on top of this view (also the way to reach it on phones). -->
            <IconButton
              v-if="player.queueEditable"
              icon="i-lucide-list-music"
              color="neutral"
              variant="ghost"
              label="Up next"
              @click="player.setQueueOpen(true)"
            />
            <!-- The owner's editor: never for a share page's visitors -->
            <IconButton
              v-if="player.current && !shared"
              :to="`/tracks/${player.current.id}/edit`"
              icon="i-lucide-pencil"
              color="neutral"
              variant="ghost"
              label="Edit track"
              @click="open = false"
            />
            <!--
              Stops playback and puts the player away, as the ✕ of the player bar does: on phones
              the bar has no room for one, and this was the only way to get rid of it. Not on
              share pages, whose player belongs to the page.
            -->
            <IconButton
              v-if="!shared"
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              label="Close player"
              data-testid="player-expanded-close"
              @click="player.close()"
            />
          </div>
        </header>

        <!--
          Phones' lyrics view: small cover and title, the lyrics filling the rest in their own
          scrolling box (`min-h-0 flex-1` gives LyricsView the definite height it scrolls in, so
          auto-scroll moves the lyrics, never the view), then the waveform and the essential
          controls. The view itself does not scroll, so a pull-down starting on the title or the
          controls closes it; the lyrics and the waveform drag by themselves (`data-swipe-ignore`).
        -->
        <div
          v-if="lyricsView"
          class="flex min-h-0 flex-1 flex-col gap-4 px-4 pb-6"
          data-testid="player-lyrics-view"
        >
          <!-- Which track this is, in little room: small cover, title and composers -->
          <div class="flex min-w-0 items-center gap-3">
            <TrackCover
              :url="track?.coverUrl"
              :title="track?.title"
              class="size-14 shrink-0"
            />
            <div class="min-w-0">
              <h2 class="truncate text-lg font-bold tracking-tight">
                {{ track?.title }}
              </h2>
              <p class="truncate text-sm text-muted">
                {{ track?.composers || '—' }}
              </p>
            </div>
          </div>

          <!-- The lines fade out at the top and bottom edges of their box instead of being cut off -->
          <div
            class="min-h-0 flex-1 [mask-image:linear-gradient(to_bottom,transparent,black_1.5rem,black_calc(100%-2.5rem),transparent)]"
            data-swipe-ignore
          >
            <!-- One view per track (key): a new track's lyrics start at the top, not where the last ones were scrolled -->
            <LyricsView
              :key="player.current?.id"
              :synced="player.current?.lyricsSynced ?? null"
              :plain="player.current?.lyrics ?? null"
              :current-time="player.currentTime"
              size="large"
              :shared="shared"
              @seek="player.seek"
            />
          </div>

          <!-- Progress and the essential controls (the normal view has shuffle, stop, repeat and the volume) -->
          <div data-swipe-ignore>
            <PlayerWaveform
              v-if="player.current && open"
              :key="player.current.id"
              :peaks="player.current.peaks"
              :duration="player.duration"
              :height="40"
            />
            <div class="mt-1 flex justify-between text-xs tabular-nums text-muted">
              <span>{{ formatTime(player.currentTime) }}</span>
              <span>{{ formatRemaining(player.currentTime, player.duration) }}</span>
            </div>
          </div>
          <div class="flex justify-center">
            <PlayerControls
              size="xl"
              :show-stop="false"
              :show-modes="false"
            />
          </div>
        </div>

        <!--
          The normal layout, whenever the lyrics view above is not showing (always from `md`).
          Scrolling area on phones (the pull-down starts only at its top). `overscroll-y-contain`
          keeps a pull at the top from reaching the browser (pull to refresh) instead of the view.
          `grid-cols-1` matters on phones: without an explicit column, the column grows to the
          width of the longest unbroken text (a long title, which only truncates inside a column
          of fixed width) and the whole view spilled off the right edge.
        -->
        <div
          v-else
          ref="scroller"
          class="grid min-h-0 flex-1 grid-cols-1 gap-6 overflow-y-auto overscroll-y-contain px-4 pb-6 md:gap-10 md:overflow-hidden md:px-10"
          :class="{ 'md:grid-cols-2': twoColumns }"
        >
          <!--
            Left column: cover, info, waveform, controls. On desktop its width
            (and so the square cover) follows the window height, so the controls
            always stay on screen; 23rem is the height of everything but the cover.
            Phones do the same for the cover alone (the same 23rem), so on a short
            screen (375×667, or less with the browser's bars) play, previous and next
            stay in the first screen instead of under its bottom edge; the title and
            waveform keep the full width.
          -->
          <section class="mx-auto flex w-full max-w-md flex-col justify-center gap-5 md:max-w-[max(20rem,min(32rem,calc(100dvh-23rem)))]">
            <TrackCover
              :url="track?.coverUrl"
              :title="track?.title"
              rounded="rounded-xl"
              class="w-full shadow-2xl shadow-black/40 max-md:mx-auto max-md:max-w-[max(8rem,calc(100dvh-23rem))]"
            />

            <div class="min-w-0">
              <h2 class="truncate text-2xl font-bold tracking-tight">
                {{ track?.title }}
              </h2>
              <p class="truncate text-muted">
                {{ track?.composers || '—' }}
              </p>
              <p
                v-if="meta"
                class="truncate text-sm text-dimmed"
              >
                {{ meta }}
              </p>
            </div>

            <!-- The waveform seeks by dragging: never a pull-down -->
            <div data-swipe-ignore>
              <PlayerWaveform
                v-if="player.current && open"
                :key="player.current.id"
                :peaks="player.current.peaks"
                :duration="player.duration"
                :height="64"
              />
              <div class="mt-1 flex justify-between text-xs tabular-nums text-muted">
                <span>{{ formatTime(player.currentTime) }}</span>
                <span>{{ formatRemaining(player.currentTime, player.duration) }}</span>
              </div>
            </div>

            <p
              v-if="player.status === 'error'"
              class="text-sm text-error"
            >
              {{ player.error }}
            </p>

            <!-- Controls on their own row (six buttons fill this column), the volume under them -->
            <div class="flex flex-col items-center gap-3">
              <PlayerControls size="xl" />
              <PlayerVolume data-swipe-ignore />
            </div>
          </section>

          <!-- Right column (md+): lyrics, in their own scrolling box (never a pull-down) -->
          <section
            v-if="!isPhone && hasLyrics"
            class="min-h-0"
            data-swipe-ignore
          >
            <!-- One view per track (key), as on phones above -->
            <LyricsView
              :key="player.current?.id"
              :synced="player.current?.lyricsSynced ?? null"
              :plain="player.current?.lyrics ?? null"
              :current-time="player.currentTime"
              :shared="shared"
              @seek="player.seek"
            />
          </section>

          <!--
            The description: on phones under the controls (the lyrics have their own view, see the
            top bar); from `md`, for a track without lyrics, the right column, centred and
            scrolling by itself when long (never a pull-down there).
          -->
          <section
            v-else-if="description"
            class="mx-auto w-full max-w-md md:flex md:min-h-0 md:max-w-none md:flex-col md:justify-center md:overflow-y-auto"
            :data-swipe-ignore="isPhone ? undefined : ''"
            data-testid="player-description"
          >
            <h3 class="text-xs font-semibold uppercase tracking-widest text-muted">
              About this track
            </h3>
            <p class="mt-2 whitespace-pre-line text-default">
              {{ description }}
            </p>
          </section>
        </div>
      </div>
    </template>
  </UModal>
</template>
