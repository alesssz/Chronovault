<script setup lang="ts">
import { sharedApi } from '~/services/api'

/**
 * Public page of a track shared by link ('unlisted' or 'public'): no account
 * needed. Server-rendered, so link previews (chat apps, social networks) show
 * the title and the cover. Private tracks answer like missing ones.
 */
definePageMeta({ layout: 'public' })

// Track id from the URL (/t/:id).
const route = useRoute()
const id = String(route.params.id)
// Before any `await`: they need the component context.
const player = usePlayerStore()
// Site origin (works during SSR too): absolute URLs for the link preview tags.
const origin = useRequestURL().origin

const { data: track, error } = await useAsyncData(`shared-${id}`, () => sharedApi.get(id))

/** The track is private, missing or the id is malformed: "not available". */
const notFound = computed(() => !track.value && [400, 404].includes(error.value?.statusCode ?? 0))
if (import.meta.server && !track.value) {
  setResponseStatus(useRequestEvent()!, notFound.value ? 404 : 500)
}

// --- Link preview -----------------------------------------------------------------
const meta = computed(() => {
  const t = track.value
  return t ? [t.album, t.year, t.genre].filter(Boolean).join(' · ') : ''
})
/** Preview text: the description, or composers and album/year/genre. */
const previewText = computed(() => {
  const t = track.value
  if (!t) return 'This track is not available.'
  return truncate(t.description?.trim() || [t.composers, meta.value].filter(Boolean).join(' · ') || 'Listen on ChronoPlayer', 200)
})

useSeoMeta({
  title: () => (track.value ? `${track.value.title} · ChronoPlayer` : 'Track not available · ChronoPlayer'),
  description: () => previewText.value,
  ogTitle: () => track.value?.title ?? 'Track not available',
  ogDescription: () => previewText.value,
  ogType: 'music.song',
  ogSiteName: 'ChronoPlayer',
  ogUrl: `${origin}/t/${id}`,
  // A stable address that redirects to a fresh signed URL: previews are cached for long.
  ogImage: () => (track.value?.coverUrl ? `${origin}/api/shared/${id}/cover` : undefined),
  twitterCard: 'summary',
  // Unlisted tracks are for whoever has the link: keep them out of search engines.
  robots: () => (track.value?.visibility === 'public' ? 'index, follow' : 'noindex, nofollow'),
})

/** Cuts a preview text at `max` characters with an ellipsis. */
function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

// --- Playback ---------------------------------------------------------------------
const isLoaded = computed(() => player.current?.id === id)
/** Playing this track right now (big button shows Pause). */
const isPlaying = computed(() => isLoaded.value && player.isPlaying)
/** The lyrics column is shown only when there are lyrics. */
const hasLyrics = computed(() => !!track.value?.lyricsSynced?.length || !!track.value?.lyrics?.trim())

// The audio is ready (waveform included) before the first click.
onMounted(() => {
  if (track.value && !isLoaded.value) void player.cueShared(track.value)
})
// Leaving the page stops the music: this page is the only place it is controlled from.
onBeforeUnmount(() => player.close())

/** Play/pause; loads the track first if the player holds something else. */
async function togglePlay() {
  if (!track.value) return
  if (!isLoaded.value) await player.cueShared(track.value)
  await player.togglePlay()
}

/** Clicking a synced line seeks there (only once this track is loaded). */
function onLyricSeek(seconds: number) {
  if (isLoaded.value) player.seek(seconds)
}
</script>

<template>
  <UContainer class="py-6 sm:py-10">
    <div
      v-if="track"
      class="mx-auto grid grid-cols-[minmax(0,1fr)] gap-8"
      :class="hasLyrics ? 'max-w-6xl lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-12' : 'max-w-md'"
      data-testid="shared-track"
    >
      <!-- Left: cover, title and details, player, description -->
      <section class="flex min-w-0 flex-col gap-6 lg:sticky lg:top-6 lg:self-start">
        <TrackCover
          :url="track.coverUrl"
          :title="track.title"
          rounded="rounded-xl"
          class="mx-auto w-full max-w-sm shadow-2xl shadow-black/40 lg:max-w-none"
        />

        <div class="min-w-0">
          <h1
            class="text-3xl font-bold tracking-tight text-balance"
            data-testid="shared-title"
          >
            {{ track.title }}
          </h1>
          <p
            v-if="track.composers"
            class="mt-1 text-lg text-muted"
          >
            {{ track.composers }}
          </p>
          <p
            v-if="meta"
            class="mt-1 text-sm text-dimmed"
          >
            {{ meta }}
          </p>
        </div>

        <!-- Play button, waveform and times -->
        <div class="flex items-center gap-4">
          <UButton
            :icon="isPlaying ? 'i-lucide-pause' : 'i-lucide-play'"
            :aria-label="isPlaying ? 'Pause' : 'Play'"
            :loading="isLoaded && player.status === 'loading'"
            size="xl"
            class="shrink-0 rounded-full p-4"
            data-testid="shared-play"
            @click="togglePlay"
          />
          <div class="min-w-0 flex-1">
            <ClientOnly>
              <PlayerWaveform
                v-if="isLoaded && player.current"
                :key="player.current.id"
                :peaks="player.current.peaks"
                :duration="player.duration"
                :height="56"
              />
              <template #fallback>
                <div class="h-14" />
              </template>
            </ClientOnly>
            <div class="mt-1 flex justify-between text-xs tabular-nums text-muted">
              <span>{{ formatTime(isLoaded ? player.currentTime : 0) }}</span>
              <span>{{ formatTime(isLoaded ? player.duration : track.durationSeconds) }}</span>
            </div>
          </div>
        </div>

        <p
          v-if="isLoaded && player.status === 'error'"
          class="text-sm text-error"
        >
          {{ player.error }}
        </p>

        <div
          v-if="track.description"
          class="space-y-2"
        >
          <h2 class="text-xs font-semibold uppercase tracking-widest text-muted">
            About
          </h2>
          <p
            class="whitespace-pre-line leading-relaxed"
            data-testid="shared-description"
          >
            {{ track.description }}
          </p>
        </div>
      </section>

      <!-- Right: the lyrics (synced ones follow playback) -->
      <section
        v-if="hasLyrics"
        class="h-[70dvh] rounded-xl border border-default bg-elevated/30 px-4 sm:px-6 lg:h-[calc(100dvh-10rem)]"
        aria-label="Lyrics"
        data-testid="shared-lyrics"
      >
        <LyricsView
          :synced="track.lyricsSynced"
          :plain="track.lyrics"
          :current-time="isLoaded ? player.currentTime : 0"
          @seek="onLyricSeek"
        />
      </section>
    </div>

    <!-- Private, missing or malformed link -->
    <UEmpty
      v-else
      :icon="notFound ? 'i-lucide-link-2-off' : 'i-lucide-circle-alert'"
      :title="notFound ? 'Track not available' : 'Something went wrong'"
      :description="notFound
        ? 'The link is wrong, or the owner made this track private.'
        : 'The track could not be loaded. Try again in a moment.'"
      class="py-24"
      data-testid="shared-not-found"
    />
  </UContainer>
</template>
