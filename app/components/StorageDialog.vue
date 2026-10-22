<script setup lang="ts">
import type { OrphanFile, StorageReport } from '~~/shared/types/storage'
import { storageApi } from '~/services/api'
import { getErrorMessage } from '~/utils/errors'

/**
 * "Storage" dialog (account menu): how much the user stores, and the
 * orphaned files — uploaded but used by no track or playlist, typically
 * after an interrupted upload. Orphans old enough can be deleted in one go;
 * recent ones are listed but kept (an upload may still be in progress).
 */
const open = defineModel<boolean>('open', { default: false })
// Confirms how much was deleted.
const toast = useToast()

/** Last scan; kept while rescanning so the dialog does not flicker. */
const report = ref<StorageReport | null>(null)
/** A scan is running. */
const loading = ref(false)
/** Scan failure message (e.g. R2 unreachable), with a "Try again" action. */
const loadError = ref<string | null>(null)
/** The deletion: the dialog cannot be dismissed while it runs. */
const cleaning = useAsyncTask()

/** Scans the storage (on every opening: it must reflect the current state). */
async function load() {
  loading.value = true
  loadError.value = null
  try {
    report.value = await storageApi.report()
  }
  catch (err) {
    loadError.value = getErrorMessage(err, 'Could not read your storage')
  }
  finally {
    loading.value = false
  }
}

// Every opening rescans: the storage may have changed since.
watch(open, (value) => {
  if (value) void load()
})

/** Orphans the server will delete (old enough); the others are only listed. */
const deletable = computed(() => report.value?.orphans.filter(o => o.deletable) ?? [])
/** Space the deletion will free (shown on the button). */
const deletableBytes = computed(() => deletable.value.reduce((sum, o) => sum + o.sizeBytes, 0))

/** Deletes the deletable orphans (the server rescans first), then shows the new state. */
async function clean() {
  await cleaning.run(async () => {
    const result = await storageApi.cleanOrphans()
    toast.add({
      title: `Deleted ${pluralize(result.deletedFiles, 'file')}`,
      description: `${formatBytes(result.freedBytes)} freed`,
      icon: 'i-lucide-trash-2',
      color: 'success',
    })
    await load()
  }, 'Clean-up failed')
}

/** File name only: the folder is always the user's own id. */
function fileName(orphan: OrphanFile) {
  return orphan.path.split('/').pop()
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Storage"
    description="Your files, and files left behind by interrupted uploads."
    :dismissible="!cleaning.running"
  >
    <template #body>
      <div
        v-if="loading && !report"
        class="flex items-center justify-center gap-2 py-10 text-sm text-muted"
      >
        <UIcon
          name="i-lucide-loader-circle"
          class="size-4 animate-spin"
        />
        Scanning your storage…
      </div>

      <UAlert
        v-else-if="loadError"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :title="loadError"
        :actions="[{ label: 'Try again', onClick: load }]"
      />

      <div
        v-else-if="report"
        class="space-y-6"
        data-testid="storage-report"
      >
        <dl class="grid grid-cols-2 gap-3">
          <div class="rounded-lg border border-default p-3">
            <dt class="text-xs font-semibold uppercase tracking-widest text-muted">
              Audio
            </dt>
            <dd class="mt-1 text-lg font-semibold tabular-nums">
              {{ formatBytes(report.usage.audio.bytes) }}
            </dd>
            <dd class="text-sm text-muted">
              {{ pluralize(report.usage.audio.files, 'file') }}
            </dd>
          </div>
          <div class="rounded-lg border border-default p-3">
            <dt class="text-xs font-semibold uppercase tracking-widest text-muted">
              Covers
            </dt>
            <dd class="mt-1 text-lg font-semibold tabular-nums">
              {{ formatBytes(report.usage.covers.bytes) }}
            </dd>
            <dd class="text-sm text-muted">
              {{ pluralize(report.usage.covers.files, 'file') }}
            </dd>
          </div>
        </dl>

        <section>
          <h3 class="mb-2 text-xs font-semibold uppercase tracking-widest text-muted">
            Orphaned files
          </h3>

          <p
            v-if="!report.orphans.length"
            class="flex items-center gap-2 text-sm text-muted"
            data-testid="storage-clean"
          >
            <UIcon
              name="i-lucide-circle-check"
              class="size-4 text-success"
            />
            None: every file belongs to a track or a playlist.
          </p>

          <template v-else>
            <p class="mb-3 text-sm text-muted">
              Not used by any track or playlist, usually because an upload was interrupted.
              <template v-if="report.minAgeHours > 0">
                Files younger than {{ report.minAgeHours }} hours are kept: an upload may still be in progress.
              </template>
            </p>
            <ul class="divide-y divide-default rounded-lg border border-default">
              <li
                v-for="orphan in report.orphans"
                :key="`${orphan.bucket}:${orphan.path}`"
                class="flex items-center gap-3 px-3 py-2 text-sm"
                data-testid="storage-orphan"
              >
                <UIcon
                  :name="orphan.bucket === 'audio' ? 'i-lucide-file-audio' : 'i-lucide-image'"
                  class="size-4 shrink-0 text-muted"
                />
                <div class="min-w-0 flex-1">
                  <p class="truncate font-mono text-xs">
                    {{ fileName(orphan) }}
                  </p>
                  <p class="text-xs text-muted">
                    {{ formatBytes(orphan.sizeBytes) }} · uploaded {{ formatAge(orphan.lastModified) }}
                  </p>
                </div>
                <UBadge
                  :label="orphan.deletable ? 'Will be deleted' : 'Kept for now'"
                  :color="orphan.deletable ? 'error' : 'neutral'"
                  variant="subtle"
                  size="sm"
                />
              </li>
            </ul>
          </template>
        </section>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          label="Close"
          color="neutral"
          variant="ghost"
          :disabled="cleaning.running"
          @click="open = false"
        />
        <UButton
          :label="deletable.length
            ? `Delete ${pluralize(deletable.length, 'file')} (${formatBytes(deletableBytes)})`
            : 'Nothing to delete'"
          icon="i-lucide-trash-2"
          color="error"
          :disabled="!deletable.length || loading"
          :loading="cleaning.running"
          data-testid="storage-delete"
          @click="clean"
        />
      </div>
    </template>
  </UModal>
</template>
