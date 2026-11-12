<script setup lang="ts">
import { sharedApi } from '~/services/api'

/**
 * Public page of a playlist shared by link ('unlisted' or 'public'): no
 * account needed. Lists every track (private ones included: sharing a
 * playlist shares its content) and shows the lyrics of the track being
 * played; a second click on its row opens it full screen, description too. Server-rendered for link previews.
 * A group of versions (purpose 'versions', made by "Share for feedback") is the
 * same page, introduced as versions of one song to choose from: each version
 * gets a heart to pick it, a line under the title says so while voting is
 * open, and a panel under the list shows the pick, saved, with its optional
 * name and comment, or says that voting is closed and which version was
 * chosen (useVersionVote, ShareVersionVote). Plays heard here are counted
 * by the app-wide play counter (plugins/play-counter.client.ts). Tracks can
 * be downloaded, with their tags (useSharedTrackDownload), unless the track
 * itself is public: the track's visibility decides, not the playlist's.
 *
 * Laid out like the track page: from `md` the player is a bar at the bottom
 * of the window (SharePlayer's `bar`); a compact header and the list come
 * first, the now-playing panel beside them from `lg`.
 */
definePageMeta({ layout: 'public' })

// Playlist id from the URL (/p/:id).
const route = useRoute()
const id = String(route.params.id)
// Before any `await`: they need the component context.
const player = usePlayerStore()
// Site origin (works during SSR too): absolute URLs for the link preview tags.
const origin = useRequestURL().origin

// Private, missing or malformed links answer 404 (see useSharedItem).
const { data: playlist, notFound } = await useSharedItem(`shared-playlist-${id}`, () => sharedApi.playlist(id))

// --- Link preview -----------------------------------------------------------------
/** A group of versions of one song, rather than a playlist. */
const isVersions = computed(() => playlist.value?.purpose === 'versions')
/**
 * "Playlist · 12 tracks · 48:10", or "Versions · 3 versions · 9:30" for a
 * group (under the title, and the preview text without a description).
 */
const summary = computed(() => {
  const p = playlist.value
  if (!p) return ''
  return isVersions.value
    ? joinParts(['Versions', pluralize(p.tracks.length, 'version'), formatTime(p.durationSeconds)])
    : joinParts(['Playlist', pluralize(p.tracks.length, 'track'), formatTime(p.durationSeconds)])
})
/** Preview text: the description, or a summary (count and duration). */
const previewText = computed(() => {
  const p = playlist.value
  if (!p) return 'This playlist is not available.'
  return truncate(p.description?.trim() || summary.value, 200)
})
/** There is an image for the preview (custom cover or a track cover). */
const hasCover = computed(() => !!playlist.value && (!!playlist.value.coverUrl || playlist.value.mosaic.length > 0))

useShareMeta({
  kind: 'playlist',
  id,
  origin,
  title: () => playlist.value?.title ?? null,
  description: () => previewText.value,
  hasImage: () => hasCover.value,
  isPublic: () => playlist.value?.visibility === 'public',
})

// --- Playback ---------------------------------------------------------------------
/** The player is playing this playlist (and not something else). */
const isHere = computed(() => player.sourceKey === `playlist:${id}`)
/** Playing this playlist right now (big button shows Pause). */
const isPlaying = computed(() => isHere.value && player.isPlaying)

/**
 * The track shown in the "now playing" panel: the one the player is on (the
 * queue's, so while a newly chosen track loads, and after it failed, it is
 * that one, not the one loaded before), or the first before playing.
 */
const activeTrack = computed(() => {
  const tracks = playlist.value?.tracks ?? []
  return (isHere.value && tracks.find(t => t.id === player.displayTrack?.id)) || tracks[0] || null
})
/** "Album · Year · Genre" of the active track. */
const activeMeta = computed(() => {
  const t = activeTrack.value
  return t ? joinParts([t.album, t.year, t.genre]) : ''
})
/** The active track has lyrics to show (otherwise "No lyrics for this track"). */
const activeHasLyrics = computed(() => !!activeTrack.value && hasLyrics(activeTrack.value))

/**
 * A tablet- or desktop-wide window (Tailwind's `md`): the player is the bar at
 * the bottom of the screen, as on the track page, instead of a block between
 * the title and the list. false on the server, which cannot know, and while
 * the page hydrates, so the browser's first pass matches the server's HTML
 * (useMountedMediaQuery): the in-page player is rendered, and hidden from
 * `md` by CSS until the bar replaces it once mounted (the bar is fixed, so
 * nothing moves).
 */
const isWide = useMountedMediaQuery('(min-width: 768px)')

// The first track is ready (waveform included) before the first click.
onMounted(() => {
  if (playlist.value?.tracks.length) void player.playSharedPlaylist(playlist.value, 0, false)
})
// Leaving the page stops the music: this page is the only place it is controlled from.
onBeforeUnmount(() => player.close())

/**
 * The track is the one the player is on in this playlist (highlighted row):
 * the queue's track, like the panel above, not the one still loaded while it loads.
 */
function isActive(trackId: string) {
  return isHere.value && player.displayTrack?.id === trackId
}

/**
 * Plays the playlist from a given track. The track the player is already on
 * is toggled instead (playSharedPlaylist), while it loads too: the row's
 * click (onRowClick, when that track is not playing) goes through the
 * store, which knows the queue's track.
 */
function playAt(index: number) {
  if (playlist.value) void player.playSharedPlaylist(playlist.value, index)
}

/**
 * A row's click: the track playing opens the full-screen view (its cover,
 * lyrics and description, which this page does not show); any other track,
 * or this one paused or not started, plays. A first click plays, a second
 * shows it large. Pause stays with the big button, the bar and Space.
 */
function onRowClick(index: number, trackId: string) {
  if (isActive(trackId) && player.isPlaying) player.setExpanded(true)
  else playAt(index)
}

/**
 * Big play button: toggles the current track, or starts from the first. After
 * an error it tries the same track again (play reloads it), as Space and the
 * track page do: it used to start the playlist over from its first track.
 */
function togglePlay() {
  if (isHere.value) void player.togglePlay()
  else playAt(0)
}

/** Clicking a synced line seeks there (only while this playlist is playing). */
function onLyricSeek(seconds: number) {
  if (isHere.value) player.seek(seconds)
}

// --- Download ---------------------------------------------------------------------
/**
 * A track's file with its tags, through the playlist (as the player gets it):
 * a private track of the playlist downloads here, and only here.
 */
const { download, isDownloading } = useSharedTrackDownload(trackId => sharedApi.playlistTrackPlayback(id, trackId))

// --- Votes (groups of versions) -----------------------------------------------------
/** This browser's pick, the heart next to each version and the vote panel (groups only). */
const vote = useVersionVote(id, () => isVersions.value)

/**
 * The line under the title that asks the visitor to choose a heart: a group with versions,
 * voting open, not its owner. It sat under the list, at the bottom edge of a desktop screen,
 * far from the group's own question under the title (UI-30). The vote state is per browser and
 * loads after mount, so until then (on the server and in the first client pass, which must
 * match) "open" is read from the versions: closed once one is marked final. The line is then in
 * the server-rendered page and the list does not move when the state comes in; once loaded the
 * state decides (the owner, or a vote closed meanwhile, hide it). A state that failed to load
 * brings no hearts, so the line goes too.
 */
const showVoteHint = computed(() => {
  const p = playlist.value
  if (!p || !isVersions.value || !p.tracks.length || vote.unavailable.value) return false
  return vote.state.value ? vote.canVote.value : !p.tracks.some(track => track.status === 'final')
})

/** The version is this browser's pick (filled heart). */
function isPicked(trackId: string) {
  return vote.state.value?.pick?.trackId === trackId
}
</script>

<template>
  <UContainer class="py-6 sm:py-10 md:pt-4 md:pb-[calc(5.5rem+1px)]">
    <!--
      From `md`: the bottom padding keeps the end of the page above the player bar (4.5rem, its 1px
      border, and 1rem of air), as on the track page.
    -->
    <div
      v-if="playlist"
      class="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-12"
      data-testid="shared-playlist"
    >
      <!--
        Left: a compact header (a small cover beside the title and summary, the description under
        them), then the track list, which is what a friend opens the link for. The cover was a
        large square: on a 1505×738 window the list started at the bottom edge, and on phones,
        as wide as the screen, it pushed the list (and a group's hearts) below the first screen
        (UI-29). Below `md` the player sits between the header and the list; from `md` it is the
        bar at the bottom of the screen, as on the track page.
      -->
      <section class="flex min-w-0 flex-col gap-6">
        <div class="space-y-3">
          <div class="flex items-center gap-4 sm:gap-6">
            <PlaylistCover
              :url="playlist.coverUrl"
              :mosaic="playlist.mosaic"
              :title="playlist.title"
              rounded="rounded-lg"
              class="w-24 shrink-0 shadow-xl shadow-black/40 sm:w-32"
            />
            <div class="min-w-0">
              <h1
                class="text-2xl font-bold tracking-tight text-balance sm:text-3xl"
                data-testid="shared-playlist-title"
              >
                {{ playlist.title }}
              </h1>
              <p class="mt-1 text-sm text-dimmed">
                {{ summary }}
              </p>
            </div>
          </div>
          <p
            v-if="playlist.description"
            class="whitespace-pre-line leading-relaxed"
            data-testid="shared-playlist-description"
          >
            {{ playlist.description }}
          </p>
          <!--
            A group without a note of its own: what it is. What to do is the next line's, which
            goes once voting closes; this one stays true.
          -->
          <p
            v-else-if="isVersions"
            class="leading-relaxed text-muted"
            data-testid="shared-versions-hint"
          >
            Different versions of the same song.
          </p>
          <!--
            Groups, voting open: how to vote, right under the question the group asks (its
            description). "Choose", not "tap": the page is opened on desktops too.
          -->
          <p
            v-if="showVoteHint"
            class="flex items-center gap-2 text-sm text-muted"
            data-testid="version-vote-hint"
          >
            <UIcon
              name="i-lucide-heart"
              class="size-4 shrink-0"
            />
            Listen to each version, then choose the heart next to your favourite.
          </p>
        </div>

        <!-- Below `md`: play button, waveform, times, previous / next, volume, full screen and playback errors -->
        <div
          v-if="playlist.tracks.length && !isWide"
          class="md:hidden"
        >
          <SharePlayer
            :active="isHere"
            :duration="activeTrack?.durationSeconds ?? null"
            navigation
            @toggle="togglePlay"
          />
        </div>

        <!-- The tracks: click to play (or toggle the active one), download; in a group, a heart to pick one -->
        <ol
          v-if="playlist.tracks.length"
          class="divide-y divide-default rounded-xl border border-default"
          aria-label="Tracks"
        >
          <li
            v-for="(track, index) in playlist.tracks"
            :key="track.id"
            class="flex items-center"
            :class="{ 'bg-primary/5': isActive(track.id) }"
            data-testid="shared-playlist-track"
          >
            <button
              type="button"
              class="flex min-w-0 flex-1 cursor-pointer items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-elevated/50"
              :aria-current="isActive(track.id) ? 'true' : undefined"
              :title="isActive(track.id) && player.isPlaying ? 'Open full screen' : undefined"
              @click="onRowClick(index, track.id)"
            >
              <span class="w-5 shrink-0 text-right text-sm tabular-nums text-dimmed">
                <UIcon
                  v-if="isActive(track.id) && player.isPlaying"
                  name="i-lucide-audio-lines"
                  class="size-4 text-primary"
                />
                <template v-else>{{ index + 1 }}</template>
              </span>
              <TrackCover
                :url="track.coverUrl"
                :title="track.title"
                class="size-10"
              />
              <span class="min-w-0 flex-1">
                <!--
                  Title, "WIP" on drafts (versions to choose from). In a group the title takes up to
                  two lines: versions share the start of their title, and on phones the part that
                  tells them apart was cut off. There, phones also drop what every row repeats: the
                  WIP badge (versions are drafts until one is chosen) and the duration.
                -->
                <span class="flex min-w-0 items-center gap-2">
                  <span
                    class="min-w-0 font-medium"
                    :class="[isVersions ? 'line-clamp-2 break-words' : 'truncate', { 'text-primary': isActive(track.id) }]"
                  >{{ track.title }}</span>
                  <UBadge
                    v-if="track.status === 'draft'"
                    label="WIP"
                    color="warning"
                    variant="subtle"
                    size="sm"
                    class="shrink-0"
                    :class="{ 'max-sm:hidden': isVersions }"
                    title="Work in progress"
                    data-testid="shared-track-wip"
                  />
                  <!-- In a group, the version the owner chose (voting is then closed) -->
                  <UBadge
                    v-else-if="isVersions"
                    label="Chosen"
                    color="success"
                    variant="subtle"
                    size="sm"
                    class="shrink-0"
                    data-testid="shared-track-chosen"
                  />
                </span>
                <span class="block truncate text-sm text-muted">{{ track.composers || '—' }}</span>
              </span>
              <span
                class="text-sm tabular-nums text-muted"
                :class="{ 'max-sm:hidden': isVersions }"
              >{{ formatTime(track.durationSeconds) }}</span>
            </button>
            <!-- The track's file, with its tags; never for a public track -->
            <IconButton
              v-if="track.downloadable"
              icon="i-lucide-download"
              :label="`Download ${track.title}`"
              color="neutral"
              variant="ghost"
              :loading="isDownloading(track.id)"
              class="shrink-0"
              :class="{ 'mr-2': !vote.canVote.value }"
              data-testid="shared-track-download"
              @click="download(track)"
            />
            <!-- Pick this version (again: take the pick back); only while voting is open, never for the owner -->
            <IconButton
              v-if="vote.canVote.value"
              icon="i-lucide-heart"
              :label="isPicked(track.id) ? `Take back your pick of ${track.title}` : `Pick ${track.title}`"
              :color="isPicked(track.id) ? 'primary' : 'neutral'"
              :variant="isPicked(track.id) ? 'solid' : 'ghost'"
              :disabled="vote.busy.value"
              class="mr-2 shrink-0"
              :aria-pressed="isPicked(track.id)"
              data-testid="version-pick"
              @click="vote.toggle(track.id)"
            />
          </li>
        </ol>

        <!-- Groups: the pick (saved) and its note, the owner's note, or the outcome -->
        <ShareVersionVote
          v-if="isVersions && playlist.tracks.length"
          :state="vote.state.value"
          :tracks="playlist.tracks"
          :busy="vote.busy.value"
          @save="vote.saveNote"
        />

        <!--
          No tracks. An explicit condition, not `v-else`: the vote panel above sits between
          it and the list, and a `v-else` would pair with the panel's `v-if` instead.
        -->
        <UEmpty
          v-if="!playlist.tracks.length"
          icon="i-lucide-list-music"
          title="This playlist is empty"
          data-testid="shared-playlist-empty"
        />
      </section>

      <!--
        Now playing: the active track's title and lyrics, nothing else. Its description (About) is
        in the full-screen view, a second click on the row away: here, a long one squeezed the
        lyrics to two lines. From `lg` the right column, from
        the header's top edge down to the player bar (100dvh less the page's header and top
        padding, 4.5rem and 1px, and the bar with its 1rem of air, 5.5rem and 1px), staying in
        view while the list scrolls.
      -->
      <section
        v-if="activeTrack"
        class="flex min-w-0 flex-col gap-4 lg:sticky lg:top-4 lg:h-[calc(100dvh-10rem-2px)] lg:self-start"
        aria-label="Now playing"
        data-testid="shared-now-playing"
      >
        <div class="min-w-0">
          <p class="text-xs font-semibold uppercase tracking-widest text-muted">
            {{ isPlaying ? 'Now playing' : 'Track' }}<span
              v-if="activeTrack.status === 'draft'"
              class="text-warning"
            > · Work in progress</span>
          </p>
          <h2
            class="truncate text-xl font-bold tracking-tight"
            data-testid="shared-now-playing-title"
          >
            {{ activeTrack.title }}
          </h2>
          <p
            v-if="activeTrack.composers || activeMeta"
            class="truncate text-sm text-muted"
          >
            {{ [activeTrack.composers, activeMeta].filter(Boolean).join(' · ') }}
          </p>
        </div>

        <!--
          The panel draws the frame, its scrolling child (ShareLyrics → LyricsView) the side
          padding (`*:px-…`), so a scrollbar runs along the right border, not 1.5rem (30px) inside
          it; `overflow-hidden` clips the scrollbar's ends to the rounded corners. Built like the
          track page's panel (TrackShowcase).
        -->
        <div
          v-if="activeHasLyrics"
          class="h-[60dvh] min-h-0 overflow-hidden rounded-xl border border-default bg-elevated/30 *:px-4 sm:*:px-6 lg:h-auto lg:flex-1"
          data-testid="shared-lyrics"
        >
          <!-- The position is read inside ShareLyrics: read here, it re-rendered the whole page every frame -->
          <!--
            Centred and two sizes smaller than the track page's (`compact`): at that size, in this
            narrower panel, nearly every line wrapped (UI-32). No room after the last line, as on
            the track page: the panel is not as tall as the screen.
          -->
          <ShareLyrics
            :key="activeTrack.id"
            :synced="activeTrack.lyricsSynced"
            :plain="activeTrack.lyrics"
            :following="isHere && player.current?.id === activeTrack.id"
            centered
            :end-room="false"
            size="compact"
            @seek="onLyricSeek"
          />
        </div>
        <p
          v-else
          class="text-sm text-muted"
        >
          No lyrics for this track.
        </p>
      </section>
    </div>

    <!-- From `md`: the player as a bar at the bottom of the screen, with previous / next and full screen -->
    <SharePlayer
      v-if="playlist?.tracks.length && isWide"
      bar
      navigation
      full-screen
      :active="isHere"
      :duration="activeTrack?.durationSeconds ?? null"
      @toggle="togglePlay"
    />

    <!-- Private, missing or malformed link -->
    <ShareUnavailable
      v-if="!playlist"
      kind="playlist"
      :not-found="notFound"
    />
  </UContainer>
</template>
