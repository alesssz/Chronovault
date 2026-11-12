<script setup lang="ts">
import type { TrackDetail } from '~~/shared/types/track'
import { AUDIO_ACCEPT, getExtension } from '~~/shared/utils/audio-files'
import { conversionLabel } from '~/lib/prepare-audio'
import type { ReplaceStatus } from '~/composables/useAudioReplace'

/**
 * Replace audio (the File section of the track editor, TrackEditSidebar):
 * swaps the track's audio file for a new one, such as its master, keeping
 * everything else: title, lyrics, cover, plays, votes, playlists and share
 * links. Only the file and what is measured from it change (format, size,
 * duration, waveform). The work is useAudioReplace's; this is the screen
 * around it:
 *   - a file picked or dropped (the formats and size limit of the upload),
 *     then shown in its place: name, format and size, with a ✕ to choose
 *     another one (the drop zone listed nothing, so nothing said which file
 *     Replace would send);
 *   - when the track has synced lyrics, a note that they are kept but marked
 *     for checking (a master may trim or shift the audio);
 *   - Replace, then the status line of the upload list (analyzing,
 *     converting with the FLAC outcome, uploading with progress, saving);
 *   - a failure, with its reason: the track is unchanged.
 * While it runs the dialog cannot be closed, and leaving the page (or closing
 * the tab) asks first: the file is on its way. Once done, `replaced` hands the
 * updated track to the editor and the dialog closes.
 */
const props = defineProps<{
  /** The track whose audio is replaced, as last saved. */
  track: TrackDetail
}>()

// Tells the editor the replace is done, with the updated track.
const emit = defineEmits<{
  /** The track now plays the new file (the player already knows). */
  replaced: [track: TrackDetail]
}>()

/** The dialog is open. */
const open = defineModel<boolean>('open', { required: true })

// "Audio replaced" once done.
const toast = useToast()

// The replace itself: status, progress, outcome.
const replacing = useAudioReplace()
// Its state, under short names for the template.
const { status, progress, conversionProgress, conversion, error, running } = replacing

/** The file picked or dropped; null until then. */
const picked = ref<File | null>(null)

// Each opening starts afresh: no file, no status from the last time.
watch(open, (isOpen) => {
  if (!isOpen) return
  picked.value = null
  replacing.reset()
})
// Another file picked: the outcome shown was the previous one's.
watch(picked, () => {
  if (!running.value) replacing.reset()
})

// The Android back button closes the dialog, unless a replace is running.
useCloseOnBack(open, () => {
  if (!running.value) open.value = false
})

/** The picked file's format, from its name ("FLAC"); empty for a name without an extension. */
const pickedFormat = computed(() => picked.value ? getExtension(picked.value.name).toUpperCase() : '')

/** Status line for each step (the upload list's own words). */
const STATUS_LABELS: Partial<Record<ReplaceStatus, string>> = {
  analyzing: 'Analyzing',
  converting: 'Converting to FLAC',
  uploading: 'Uploading',
  saving: 'Saving',
}

/** Replace: runs the whole replace; on success the editor gets the track and the dialog closes. */
async function onReplace() {
  if (!picked.value) return
  // The track now on the new file, or null when it failed (the reason shows in the dialog).
  const updated = await replacing.replace(props.track.id, picked.value)
  if (!updated) return
  emit('replaced', updated)
  open.value = false
  toast.add({
    title: 'Audio replaced',
    description: updated.syncNeedsReview ? 'Check the synced lyrics in the Sync tab.' : undefined,
    icon: 'i-lucide-check',
    color: 'success',
  })
}

// Closing the tab while the file is on its way: the browser asks first.
useEventListener('beforeunload', (event: BeforeUnloadEvent) => {
  if (running.value) event.preventDefault()
})
// Going to another page of the app meanwhile: the app's own question.
const confirmLeave = useLeaveConfirm()
onBeforeRouteLeave(async () => {
  if (!running.value) return true
  // Stay or Leave, from the app's dialog.
  const answer = await confirmLeave({
    title: 'Replacing the audio',
    description: 'The new file is being uploaded. If you leave now, the track keeps its old audio.',
    leaveLabel: 'Leave',
  })
  return answer === 'leave'
})
</script>

<template>
  <UModal
    v-model:open="open"
    title="Replace audio"
    description="Swap the audio file for a new one, such as its master. Title, lyrics, cover, plays and share links stay as they are."
    :dismissible="!running"
    :close="!running"
  >
    <template #body>
      <div class="space-y-4">
        <!-- The new file: picked or dropped (same formats and limit as the upload) -->
        <UFileUpload
          v-if="!picked"
          v-model="picked"
          :accept="AUDIO_ACCEPT"
          icon="i-lucide-audio-lines"
          label="Drop the new audio file here, or click to choose it"
          description="MP3, WAV, FLAC, AAC/M4A, OGG/Opus · max 500 MB"
          layout="list"
          :preview="false"
          :disabled="running"
          class="min-h-32 w-full"
          data-testid="replace-audio-dropzone"
        />
        <!-- The file picked, in the drop zone's place: what Replace will send, and ✕ to choose another -->
        <div
          v-else
          class="flex items-center gap-3 rounded-lg border border-default p-3"
          data-testid="replace-audio-file"
        >
          <UIcon
            name="i-lucide-file-audio"
            class="size-5 shrink-0 text-primary"
          />
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium">
              {{ picked.name }}
            </p>
            <p class="text-xs text-muted">
              {{ [pickedFormat, formatBytes(picked.size)].filter(Boolean).join(' · ') }}
            </p>
          </div>
          <IconButton
            icon="i-lucide-x"
            label="Choose another file"
            color="neutral"
            variant="ghost"
            size="sm"
            :disabled="running"
            @click="picked = null"
          />
        </div>

        <!-- Synced lyrics: kept, but flagged for checking once the file changes -->
        <UAlert
          v-if="track.hasSyncedLyrics"
          icon="i-lucide-timer"
          color="warning"
          variant="subtle"
          description="The synced lyrics are kept, but marked for checking: the new file may not line up with them."
          data-testid="replace-audio-sync-note"
        />

        <!-- Where the replace has got to: the step, its progress, the FLAC outcome -->
        <div
          v-if="running"
          class="space-y-1.5"
          data-testid="replace-audio-progress"
          :data-status="status"
        >
          <p class="text-sm text-muted">
            {{ STATUS_LABELS[status] }}…
          </p>
          <UProgress
            v-if="status === 'uploading'"
            :model-value="Math.round(progress * 100)"
            size="sm"
          />
          <UProgress
            v-else-if="status === 'converting'"
            :model-value="Math.round(conversionProgress * 100)"
            size="sm"
          />
          <UProgress
            v-else
            size="sm"
          />
        </div>
        <!-- What the WAV → FLAC step did (converted and verified, or why the WAV was kept), as on the upload page -->
        <p
          v-if="conversion && status !== 'converting'"
          class="flex items-center gap-1 text-xs"
          :class="conversion.kind === 'flac' ? 'text-success' : 'text-muted'"
        >
          <UIcon
            :name="conversion.kind === 'flac' ? 'i-lucide-shield-check' : 'i-lucide-info'"
            class="size-3.5 shrink-0"
          />
          {{ conversionLabel(conversion) }}
        </p>

        <!-- A failure, with its reason: the track still has its old file -->
        <UAlert
          v-if="error"
          icon="i-lucide-circle-alert"
          color="error"
          variant="subtle"
          title="The audio was not replaced"
          :description="error"
          data-testid="replace-audio-error"
        />
      </div>
    </template>
    <!-- Cancel (not while it runs: the file is on its way), or Replace once a file is picked -->
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          label="Cancel"
          color="neutral"
          variant="ghost"
          :disabled="running"
          @click="open = false"
        />
        <UButton
          label="Replace"
          icon="i-lucide-replace"
          :loading="running"
          :disabled="!picked"
          data-testid="replace-audio-confirm"
          @click="onReplace"
        />
      </div>
    </template>
  </UModal>
</template>
