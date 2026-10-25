<script setup lang="ts">
/**
 * Upload page: drop or pick audio files; each one goes through the upload
 * queue (useTrackUploader): analysis → WAV-to-FLAC conversion → direct
 * upload to R2 → registration. The list shows every file's status, progress
 * and conversion outcome.
 */
import type { UploadConversion, UploadStatus } from '~/composables/useTrackUploader'
import { AUDIO_ACCEPT } from '~~/shared/utils/audio-files'

// Browser tab title: "Upload tracks · Chronovault".
usePageTitle('Upload tracks')

// The upload queue and its actions.
const { items, pending, completed, add, remove, clearFinished } = useTrackUploader()
/** Files chosen in the drop zone (moved to the queue right away). */
const picked = ref<File[] | null>(null)

// The upload component is only used to pick files: they move to the queue right away.
watch(picked, (files) => {
  if (!files?.length) return
  add(files)
  picked.value = null
})

/** Badge label, color and icon for each upload status. */
const statusInfo: Record<UploadStatus, { label: string, color: 'neutral' | 'primary' | 'success' | 'error', icon: string }> = {
  queued: { label: 'Queued', color: 'neutral', icon: 'i-lucide-clock' },
  analyzing: { label: 'Analyzing', color: 'primary', icon: 'i-lucide-scan-search' },
  converting: { label: 'Converting to FLAC', color: 'primary', icon: 'i-lucide-file-audio' },
  uploading: { label: 'Uploading', color: 'primary', icon: 'i-lucide-upload' },
  saving: { label: 'Saving', color: 'primary', icon: 'i-lucide-save' },
  done: { label: 'Done', color: 'success', icon: 'i-lucide-check' },
  error: { label: 'Error', color: 'error', icon: 'i-lucide-circle-alert' },
}

/** "FLAC · lossless … 70 MB → 35 MB (−50%)", or why the WAV was kept as is. */
function conversionLabel(conversion: UploadConversion): string {
  if (conversion.kind === 'kept') return `Kept as WAV: ${conversion.reason}`
  // Space saved, as a whole percentage.
  const saved = Math.round((1 - conversion.flacBytes / conversion.originalBytes) * 100)
  return `FLAC · lossless, verified bit for bit · ${formatBytes(conversion.originalBytes)} → ${formatBytes(conversion.flacBytes)} (−${saved}%)`
}

// Warn before closing the page while uploads are in progress.
useEventListener('beforeunload', (event: BeforeUnloadEvent) => {
  if (pending.value > 0) event.preventDefault()
})
</script>

<template>
  <UContainer class="max-w-3xl py-6 sm:py-8">
    <!-- Header: back and title -->
    <div class="mb-6 flex items-center gap-2">
      <IconButton
        to="/"
        icon="i-lucide-arrow-left"
        color="neutral"
        variant="ghost"
        label="Back to library"
      />
      <h1 class="text-2xl font-semibold tracking-tight">
        Upload tracks
      </h1>
    </div>

    <!-- Drop zone / file picker: files go straight to the upload queue -->
    <UFileUpload
      v-model="picked"
      multiple
      :accept="AUDIO_ACCEPT"
      icon="i-lucide-audio-lines"
      label="Drop your audio files here"
      description="MP3, WAV, FLAC, AAC/M4A, OGG/Opus · max 500 MB per file"
      layout="list"
      :preview="false"
      class="min-h-48 w-full"
      data-testid="upload-dropzone"
    />

    <!-- What is read from the files -->
    <p class="mt-3 text-sm text-muted">
      Title, composers, album, year, genre, lyrics and cover are read from the file tags.
      You can edit them later.
    </p>

    <!-- What happens to WAV files (lossless FLAC conversion) -->
    <UAlert
      icon="i-lucide-shield-check"
      color="neutral"
      variant="subtle"
      title="WAV files are converted to FLAC"
      class="mt-4"
      data-testid="flac-notice"
    >
      <template #description>
        FLAC is lossless: it compresses the audio like a ZIP file, typically to about half the size, and decodes
        back to exactly the same samples. Every converted file is decoded again and compared with the original,
        bit for bit, before uploading. If anything does not match — or the WAV uses a format FLAC cannot store
        exactly, such as 32-bit floating point — the original WAV is uploaded unchanged.
      </template>
    </UAlert>

    <!-- The upload queue: status, progress and outcome of every file -->
    <section
      v-if="items.length"
      class="mt-8"
    >
      <!-- The queue's title with how many are left, and Clear list once nothing is running -->
      <div class="mb-3 flex items-center justify-between">
        <h2 class="font-medium">
          Uploads
          <span class="text-muted">· {{ completed }}/{{ items.length }}</span>
        </h2>
        <UButton
          v-if="pending === 0"
          label="Clear list"
          color="neutral"
          variant="ghost"
          size="sm"
          @click="clearFinished()"
        />
      </div>

      <!-- One row per file -->
      <ul class="divide-y divide-default rounded-lg border border-default">
        <li
          v-for="item in items"
          :key="item.key"
          class="flex items-center gap-3 p-3"
          data-testid="upload-item"
          :data-status="item.status"
        >
          <!-- Its status as an icon (coloured while working, green done, red failed) -->
          <UIcon
            :name="statusInfo[item.status].icon"
            class="size-5 shrink-0"
            :class="{
              'text-success': item.status === 'done',
              'text-error': item.status === 'error',
              'text-primary': ['analyzing', 'converting', 'uploading', 'saving'].includes(item.status),
              'text-muted': item.status === 'queued',
            }"
          />
          <!-- Title, status text, progress bars and the FLAC outcome -->
          <div class="min-w-0 flex-1 space-y-1.5">
            <div class="flex items-center justify-between gap-2">
              <p class="truncate text-sm font-medium">
                {{ item.title }}
              </p>
              <span class="shrink-0 text-xs text-muted">{{ formatBytes(item.file.size) }}</span>
            </div>
            <UProgress
              v-if="item.status === 'uploading'"
              :model-value="Math.round(item.progress * 100)"
              size="sm"
            />
            <UProgress
              v-else-if="item.status === 'converting'"
              :model-value="Math.round(item.conversionProgress * 100)"
              size="sm"
            />
            <UProgress
              v-else-if="item.status === 'analyzing' || item.status === 'saving'"
              size="sm"
            />
            <p
              v-else-if="item.error"
              class="text-xs text-error"
            >
              {{ item.error }}
            </p>
            <UBadge
              v-else
              :label="statusInfo[item.status].label"
              :color="statusInfo[item.status].color"
              variant="subtle"
              size="sm"
            />
            <p
              v-if="item.conversion && item.status !== 'converting'"
              class="flex items-center gap-1 text-xs"
              :class="item.conversion.kind === 'flac' ? 'text-success' : 'text-muted'"
              data-testid="upload-conversion"
            >
              <UIcon
                :name="item.conversion.kind === 'flac' ? 'i-lucide-shield-check' : 'i-lucide-info'"
                class="size-3.5 shrink-0"
              />
              {{ conversionLabel(item.conversion) }}
            </p>
          </div>
          <!-- Done: open the new track's editor; waiting or failed: drop it from the list -->
          <UButton
            v-if="item.status === 'done' && item.trackId"
            :to="`/tracks/${item.trackId}/edit`"
            icon="i-lucide-pencil"
            label="Edit"
            color="neutral"
            variant="subtle"
            size="sm"
          />
          <IconButton
            v-else-if="item.status === 'queued' || item.status === 'error'"
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="sm"
            label="Remove from list"
            @click="remove(item.key)"
          />
        </li>
      </ul>

      <!-- Everything finished: on to the library -->
      <div
        v-if="pending === 0 && completed > 0"
        class="mt-6 flex justify-end"
      >
        <UButton
          to="/"
          label="Go to library"
          trailing-icon="i-lucide-arrow-right"
        />
      </div>
    </section>
  </UContainer>
</template>
