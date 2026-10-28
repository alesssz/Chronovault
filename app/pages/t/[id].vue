<script setup lang="ts">
import { sharedApi } from '~/services/api'
import { APP_NAME } from '~~/shared/brand'

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

// Private, missing or malformed links answer 404 (see useSharedItem).
const { data: track, notFound } = await useSharedItem(`shared-${id}`, () => sharedApi.get(id))

// --- Link preview -----------------------------------------------------------------
/** "Album · Year · Genre" (only the parts that are set). */
const meta = computed(() => {
  const t = track.value
  return t ? joinParts([t.album, t.year, t.genre]) : ''
})
/** Preview text: the description, or composers and album/year/genre, or else "Listen on Chronovault". */
const previewText = computed(() => {
  const t = track.value
  if (!t) return 'This track is not available.'
  return truncate(t.description?.trim() || joinParts([t.composers, meta.value]) || `Listen on ${APP_NAME}`, 200)
})

useShareMeta({
  kind: 'track',
  id,
  origin,
  title: () => track.value?.title ?? null,
  description: () => previewText.value,
  hasImage: () => !!track.value?.coverUrl,
  isPublic: () => track.value?.visibility === 'public',
})

// --- Playback ---------------------------------------------------------------------
/** The player holds this track. */
const isLoaded = computed(() => player.current?.id === id)
/** The lyrics column is shown only when there are lyrics. */
const showLyrics = computed(() => !!track.value && hasLyrics(track.value))

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
      :class="showLyrics ? 'max-w-6xl lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-12' : 'max-w-md'"
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
          <!-- A draft is one version among others: friends know it is not the final cut -->
          <UBadge
            v-if="track.status === 'draft'"
            label="Work in progress"
            icon="i-lucide-flask-conical"
            color="warning"
            variant="subtle"
            class="mb-2"
            data-testid="shared-wip"
          />
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

        <!-- Play button, waveform, times, volume, full screen and playback errors -->
        <SharePlayer
          :active="isLoaded"
          :duration="track.durationSeconds"
          @toggle="togglePlay"
        />

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
        v-if="showLyrics"
        class="h-[70dvh] rounded-xl border border-default bg-elevated/30 px-4 sm:px-6 lg:h-[calc(100dvh-10rem)]"
        aria-label="Lyrics"
        data-testid="shared-lyrics"
      >
        <!-- The position is read inside ShareLyrics, so the page does not render again every frame -->
        <ShareLyrics
          :synced="track.lyricsSynced"
          :plain="track.lyrics"
          :following="isLoaded"
          @seek="onLyricSeek"
        />
      </section>
    </div>

    <!-- Private, missing or malformed link -->
    <ShareUnavailable
      v-else
      kind="track"
      :not-found="notFound"
    />
  </UContainer>
</template>
