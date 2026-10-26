<script setup lang="ts">
import type { SyncedLyricLine, TrackSummary } from '~~/shared/types/track'
import { parseLrc, serializeLrc } from '~~/shared/utils/lyrics'
import { lrcFileName } from '~/lib/tags/track-tags'
import { saveFile } from '~/lib/save-file'

/**
 * The LRC dialog of the lyrics sync editor (LyricsSyncEditor): import and
 * export of the synced lines as LRC text.
 *   Export: opens prefilled with the current sync, to copy or download as
 *           "Composers - Title.lrc".
 *   Import: paste LRC text or open an .lrc file, then Apply; the editor
 *           takes the lines (`apply`). Text without a single valid line is
 *           refused, and the sync stays as it was.
 * Section headers such as [Verse 1] survive the round trip.
 */
const props = defineProps<{
  /** The track being synced: names the downloaded file. */
  track: TrackSummary
  /** The current synced lines, prefilled when the dialog opens; null when nothing is synced. */
  lines: SyncedLyricLine[] | null
}>()

const emit = defineEmits<{
  /** Apply: the imported lines, to replace the sync with. */
  apply: [lines: SyncedLyricLine[]]
}>()

/** The dialog is open. */
const open = defineModel<boolean>('open', { required: true })

// Import errors, copy confirmations.
const toast = useToast()

// The Android back button closes the dialog without applying it.
useCloseOnBack(open, () => {
  open.value = false
})

/** Text of the dialog (export prefill, or what the user pastes or opens). */
const lrcText = ref('')

// Each opening starts from the current sync (export prefill).
watch(open, (isOpen) => {
  if (isOpen) lrcText.value = props.lines?.length ? serializeLrc(props.lines) : ''
}, { immediate: true })

/** Copies the LRC text to the clipboard (export, e.g. to paste it into another Chronovault). */
async function copyLrc() {
  if (await copyText(lrcText.value)) {
    toast.add({ title: 'LRC copied', icon: 'i-lucide-copy', color: 'success' })
  }
  else {
    // Clipboard refused (permissions): the text is still there to select by hand.
    toast.add({ title: 'Could not copy', description: 'Select the text and copy it by hand', color: 'warning' })
  }
}

/** Saves the LRC text as "Composers - Title.lrc" (export). */
function downloadLrc() {
  saveFile(new Blob([lrcText.value], { type: 'text/plain;charset=utf-8' }), lrcFileName(props.track))
}

/** Hidden file input behind "Open file". */
const lrcFileInput = ref<HTMLInputElement | null>(null)

/**
 * Loads a chosen .lrc file into the dialog (import). It is not applied yet:
 * the user sees it and confirms with Apply, like pasted text.
 */
async function openLrcFile(event: Event) {
  // The hidden file input that was used.
  const input = event.target as HTMLInputElement
  // The chosen file (none: the choice was cancelled).
  const file = input.files?.[0]
  // Cleared so choosing the same file again fires `change` again.
  input.value = ''
  if (!file) return
  lrcText.value = await file.text()
}

/** Hands the LRC's lines to the editor (import); invalid text leaves everything unchanged. */
function applyLrc() {
  // The lines the text holds.
  const parsed = parseLrc(lrcText.value)
  if (!parsed.length && lrcText.value.trim()) {
    toast.add({ title: 'No valid lines', description: 'Use the [mm:ss.xx] text format', color: 'error' })
    return
  }
  emit('apply', parsed)
  open.value = false
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="LRC lyrics"
    description="Import: paste LRC text or open an .lrc file, then Apply. Export: copy or download the text below. Section headers such as [Verse 1] are kept."
  >
    <template #body>
      <UTextarea
        v-model="lrcText"
        :rows="14"
        autoresize
        :maxrows="20"
        class="w-full font-mono"
        placeholder="[00:10.00] [Verse 1]&#10;[00:12.34] First line"
      />
    </template>
    <template #footer>
      <div class="flex w-full flex-wrap items-center justify-between gap-2">
        <!-- Import from a file · export by copy or download -->
        <div class="flex flex-wrap gap-1">
          <UButton
            label="Open file"
            icon="i-lucide-folder-open"
            color="neutral"
            variant="ghost"
            size="sm"
            data-testid="lrc-open"
            @click="lrcFileInput?.click()"
          />
          <input
            ref="lrcFileInput"
            type="file"
            accept=".lrc,.txt,text/plain"
            class="hidden"
            data-testid="lrc-file-input"
            @change="openLrcFile"
          >
          <UButton
            label="Copy"
            icon="i-lucide-copy"
            color="neutral"
            variant="ghost"
            size="sm"
            :disabled="!lrcText.trim()"
            data-testid="lrc-copy"
            @click="copyLrc"
          />
          <UButton
            label="Download .lrc"
            icon="i-lucide-download"
            color="neutral"
            variant="ghost"
            size="sm"
            :disabled="!lrcText.trim()"
            data-testid="lrc-download"
            @click="downloadLrc"
          />
        </div>
        <!-- Close, or replace the sync with the text above (kept on the right when the footer wraps) -->
        <div class="ml-auto flex gap-2">
          <UButton
            label="Cancel"
            color="neutral"
            variant="ghost"
            @click="open = false"
          />
          <UButton
            label="Apply"
            @click="applyLrc"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
