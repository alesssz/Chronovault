<script setup lang="ts">
import { sharedApi } from '~/services/api'
import { APP_NAME } from '~~/shared/brand'

/**
 * Public page of a track shared by link ('unlisted' or 'public'): no account
 * needed. Server-rendered, so link previews (chat apps, social networks) show
 * the title and the cover. Private tracks answer like missing ones. Visitors
 * can also download an unlisted track, with its tags (useSharedTrackDownload);
 * a public one, never.
 * The body is TrackShowcase, the full-screen player's too: from `md` a band
 * with the title, the cover and About on the left, the lyrics as tall beside
 * them; the player is then a bar fixed at the bottom of the screen, with
 * Download. Below `md` everything stacks (cover, title, player, lyrics,
 * About) and the player is in the page.
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
/** The track has lyrics: the lyrics panel, beside the cover from `md`. */
const showLyrics = computed(() => !!track.value && hasLyrics(track.value))
/**
 * A tablet- or desktop-wide window (Tailwind's `md`, where TrackShowcase has
 * two columns): the player is the bar at the bottom of the screen instead of
 * a block in the page. false on the server, which cannot know: the in-page
 * player is rendered, and hidden from `md` by CSS until the bar replaces it
 * once mounted (the bar is fixed, so nothing moves).
 */
const isWide = useMediaQuery('(min-width: 768px)')

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

// --- Download ---------------------------------------------------------------------
/** The file with its tags, through the same streaming address the player uses. */
const { download, isDownloading } = useSharedTrackDownload(sharedApi.playback)
</script>

<template>
  <UContainer class="py-6 sm:py-10 md:pt-4 md:pb-[calc(5.5rem+1px)]">
    <!--
      From `md`: the bottom padding keeps the end of the page above the player bar (4.5rem, its 1px
      border, and 1rem of air).
    -->
    <!--
      The track: TrackShowcase, the full-screen player's body too, so the two look the same
      (band with the title, cover and About on the left, the lyrics as tall beside them). The page
      brings what only it has: the in-page player below `md`, the lyrics that follow the player
      without making the page render every frame (ShareLyrics), and Download.
    -->
    <TrackShowcase
      v-if="track"
      :title="track.title"
      :composers="track.composers"
      :meta="meta"
      :draft="track.status === 'draft'"
      :cover-url="track.coverUrl"
      :description="track.description"
      :has-lyrics="showLyrics"
      testid="shared"
    >
      <!-- Below `md`: the player in the page (play button, waveform, controls, errors), then Download -->
      <template
        v-if="!isWide"
        #player
      >
        <SharePlayer
          :active="isLoaded"
          :duration="track.durationSeconds"
          @toggle="togglePlay"
        />
        <!--
          The file, with title, lyrics and cover written in. Never for a public track. "Download" with
          its icon, as on the owner's edit page (the format is in the toast that follows).
        -->
        <UButton
          v-if="track.downloadable"
          icon="i-lucide-download"
          label="Download"
          color="neutral"
          variant="subtle"
          size="lg"
          block
          :loading="isDownloading(track.id)"
          data-testid="shared-download"
          @click="download(track)"
        />
      </template>
      <template #lyrics>
        <!--
          Centred: the panel is wide, and left-aligned lines left its right half empty. No room after
          the last line (`end-room`): made for the phones' lyrics view, it was some 330px of nothing here.
        -->
        <ShareLyrics
          :synced="track.lyricsSynced"
          :plain="track.lyrics"
          :following="isLoaded"
          centered
          :end-room="false"
          @seek="onLyricSeek"
        />
      </template>
    </TrackShowcase>

    <!-- From `md`: the player as a bar at the bottom of the screen, Download at its end -->
    <SharePlayer
      v-if="track && isWide"
      bar
      :active="isLoaded"
      :duration="track.durationSeconds"
      @toggle="togglePlay"
    >
      <template #actions>
        <!-- The file, with title, lyrics and cover written in. Never for a public track. -->
        <UButton
          v-if="track.downloadable"
          icon="i-lucide-download"
          label="Download"
          color="neutral"
          variant="subtle"
          class="shrink-0"
          :loading="isDownloading(track.id)"
          data-testid="shared-download"
          @click="download(track)"
        />
      </template>
    </SharePlayer>

    <!-- Private, missing or malformed link -->
    <ShareUnavailable
      v-if="!track"
      kind="track"
      :not-found="notFound"
    />
  </UContainer>
</template>
