<script setup lang="ts">
import type { TrackDetail } from '~~/shared/types/track'
import { tracksApi } from '~/services/api'

/**
 * Side column of the track editor (pages/tracks/[id]/edit.vue), under the
 * cover: what saves at once or needs no saving, apart from the form and its
 * "Save". The cover is the page's own (above this column from `lg`, at the top
 * of the page below it, where this column comes after the form).
 *   File    duration, format, size and upload date of the stored audio, and
 *           Replace audio (TrackReplaceAudioDialog): a new file, such as its master,
 *           everything else kept; then `replaced`, and the page takes the track.
 *   Sharing the share link, based on the saved visibility (a change in the
 *           form only applies once saved).
 *   Delete  after a confirmation: the track and its files, stopped in the
 *           player if it was playing; then `deleted`, and the page leaves.
 */
const props = defineProps<{
  /** The track as last saved. */
  track: TrackDetail
}>()

const emit = defineEmits<{
  /** The track is gone: the page marks its form saved and goes back to the library. */
  deleted: []
  /** The track's audio was replaced: the page takes the updated track (the player already has it). */
  replaced: [track: TrackDetail]
}>()

/** The Replace audio dialog is open. */
const replaceOpen = ref(false)

// A deleted track leaves the player too.
const player = usePlayerStore()

// --- Sharing -----------------------------------------------------------------------
/** Saved visibility is unlisted/public: show the share link. */
const isShared = computed(() => props.track.visibility !== 'private')

// --- Deletion --------------------------------------------------------------------
/** The delete confirmation dialog. */
const deleteOpen = ref(false)
/** The delete request (spinner in the dialog). */
const deleting = useAsyncTask()

/** Deletes the track (and its files) and stops it if playing; the page then leaves. */
async function onDelete() {
  // The id, kept: the page may drop the track once it hears of the deletion.
  const id = props.track.id
  // True once the track is deleted; false when the request failed (the task showed the error).
  const deleted = await deleting.run(async () => {
    await tracksApi.remove(id)
    player.removeTrack(id)
  }, 'Delete failed')
  if (!deleted) return
  deleteOpen.value = false
  emit('deleted')
}
</script>

<template>
  <aside class="space-y-6">
    <!--
      Technical data of the stored file, under a heading like Status's and Sharing's around it:
      without one, it read as part of the block above.
    -->
    <section
      class="space-y-2"
      aria-labelledby="track-file-heading"
    >
      <h2
        id="track-file-heading"
        class="text-xs font-semibold uppercase tracking-widest text-muted"
      >
        File
      </h2>
      <dl class="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
        <dt class="text-muted">
          Duration
        </dt>
        <dd class="text-right tabular-nums">
          {{ formatTime(track.durationSeconds) }}
        </dd>
        <dt class="text-muted">
          Format
        </dt>
        <dd class="text-right">
          {{ track.mimeType.replace('audio/', '').toUpperCase() }}
        </dd>
        <dt class="text-muted">
          Size
        </dt>
        <dd class="text-right">
          {{ formatBytes(track.sizeBytes) }}
        </dd>
        <dt class="text-muted">
          Uploaded
        </dt>
        <dd class="text-right">
          {{ new Date(track.createdAt).toLocaleDateString() }}
        </dd>
      </dl>
      <!-- A new file for the track (e.g. its master), everything else kept: in the dialog below -->
      <UButton
        label="Replace audio"
        icon="i-lucide-replace"
        color="neutral"
        variant="subtle"
        size="sm"
        block
        class="mt-1"
        data-testid="replace-audio"
        @click="replaceOpen = true"
      />
    </section>

    <!-- Replace audio: pick the new file, upload it, swap it in -->
    <TrackReplaceAudioDialog
      v-model:open="replaceOpen"
      :track="track"
      @replaced="emit('replaced', $event)"
    />

    <!-- Sharing: link of the public page, or how to get one -->
    <ShareLinkBox
      :id="track.id"
      kind="track"
      :shared="isShared"
      :title="track.title"
    />

    <!-- Deletion, after a confirmation (below) -->
    <UButton
      label="Delete track"
      icon="i-lucide-trash-2"
      color="error"
      variant="soft"
      block
      @click="deleteOpen = true"
    />

    <!-- Delete confirmation -->
    <ConfirmDialog
      v-model:open="deleteOpen"
      title="Delete this track?"
      :description="`“${track.title}” and its files will be permanently deleted.`"
      confirm-label="Delete"
      :loading="deleting.running"
      @confirm="onDelete"
    />
  </aside>
</template>
