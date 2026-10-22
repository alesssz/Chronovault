<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { QueueItem } from '~/stores/player'

/**
 * Content of the "Up next" panel: the current track, then the upcoming ones.
 * Upcoming tracks can be dragged (handle, mouse or touch), moved with their
 * menu, removed, or played right away. Every change goes straight to the
 * player store: the queue is the store's, this list only mirrors it.
 */
const player = usePlayerStore()

/** The "Now playing" row (the queued summary while the full data loads). */
const current = computed(() => player.displayTrack)
/** Queue position of the first upcoming track. */
const offset = computed(() => player.index + 1)

/**
 * Local copy of the upcoming tracks for SortableJS, which moves DOM nodes
 * itself; kept in sync with the store in both directions.
 */
const items = ref<QueueItem[]>([...player.upcoming])
// Store → list: any queue change (from a menu, "next", a deletion) redraws it.
watch(() => player.upcoming, (value) => {
  items.value = [...value]
})

/** The <ol> that SortableJS makes draggable. */
const listEl = ref<HTMLElement | null>(null)
// A dragged row moves in the store's queue (list positions → queue positions).
useSortableList(listEl, items, (from, to) => player.moveInQueue(offset.value + from, offset.value + to))

/** Moves the upcoming track at list position `i` by `delta` places. */
function move(i: number, delta: number) {
  player.moveInQueue(offset.value + i, offset.value + i + delta)
}

/**
 * The "⋮" menu of upcoming track `i` (list position): play it now, move it
 * to the top ("Play next"), one place up/down, or remove it. Positions are
 * converted to absolute queue positions with `offset`.
 */
function menuFor(i: number): DropdownMenuItem[][] {
  const last = items.value.length - 1
  return [
    [
      { label: 'Play now', icon: 'i-lucide-play', onSelect: () => void player.playFromQueue(offset.value + i) },
      { label: 'Play next', icon: 'i-lucide-list-start', disabled: i === 0, onSelect: () => player.moveInQueue(offset.value + i, offset.value) },
    ],
    [
      { label: 'Move up', icon: 'i-lucide-arrow-up', disabled: i === 0, onSelect: () => move(i, -1) },
      { label: 'Move down', icon: 'i-lucide-arrow-down', disabled: i === last, onSelect: () => move(i, 1) },
    ],
    [{ label: 'Remove from queue', icon: 'i-lucide-list-x', color: 'error', onSelect: () => player.removeFromQueue(offset.value + i) }],
  ]
}
</script>

<template>
  <div class="flex flex-col">
    <!-- Now playing -->
    <section
      v-if="current"
      class="border-b border-default px-4 py-3 sm:px-6"
    >
      <h3 class="mb-2 text-xs font-semibold uppercase tracking-widest text-muted">
        Now playing
      </h3>
      <div class="flex items-center gap-3">
        <TrackCover
          :url="current.coverUrl"
          :title="current.title"
          class="size-12"
        />
        <div class="min-w-0 flex-1">
          <p
            class="truncate font-medium text-primary"
            data-testid="queue-current"
          >
            {{ current.title }}
          </p>
          <p class="truncate text-sm text-muted">
            {{ current.composers || '—' }}
          </p>
        </div>
      </div>
    </section>

    <!-- Next up -->
    <section class="px-4 py-3 sm:px-6">
      <div class="mb-2 flex items-center justify-between gap-2">
        <h3 class="text-xs font-semibold uppercase tracking-widest text-muted">
          Next up · {{ items.length }}
        </h3>
        <UButton
          label="Clear"
          icon="i-lucide-list-x"
          color="neutral"
          variant="ghost"
          size="sm"
          :disabled="!items.length"
          data-testid="queue-clear"
          @click="player.clearUpcoming()"
        />
      </div>

      <UEmpty
        v-if="!items.length"
        icon="i-lucide-list-end"
        title="Nothing up next"
        description="Use “Play next” or “Add to queue” in a track's menu."
        class="py-8"
      />

      <!-- Always in the DOM (v-show): drag and drop binds to it once, on mount. -->
      <ol
        v-show="items.length"
        ref="listEl"
        class="-mx-2 space-y-0.5"
        data-testid="queue-list"
      >
        <li
          v-for="(track, i) in items"
          :key="track.id"
          class="flex items-center gap-2 rounded-md px-1 py-1.5 hover:bg-elevated/50"
          data-testid="queue-item"
        >
          <DragHandle />
          <TrackCover
            :url="track.coverUrl"
            :title="track.title"
            class="size-10"
          />
          <button
            type="button"
            class="min-w-0 flex-1 cursor-pointer text-left"
            :aria-label="`Play ${track.title} now`"
            @click="player.playFromQueue(offset + i)"
          >
            <span
              class="block truncate font-medium"
              data-testid="queue-item-title"
            >{{ track.title }}</span>
            <span class="block truncate text-sm text-muted">{{ track.composers || '—' }}</span>
          </button>
          <span class="hidden text-sm tabular-nums text-muted sm:block">
            {{ formatTime(track.durationSeconds) }}
          </span>
          <UDropdownMenu
            :items="menuFor(i)"
            :content="{ align: 'end' }"
          >
            <UButton
              icon="i-lucide-ellipsis-vertical"
              color="neutral"
              variant="ghost"
              :aria-label="`Queue actions for ${track.title}`"
            />
          </UDropdownMenu>
        </li>
      </ol>
    </section>
  </div>
</template>
