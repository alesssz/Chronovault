import type { TrackDetail } from '~~/shared/types/track'
import { MAX_AUDIO_BYTES, resolveAudioMimeType, storageExtension } from '~~/shared/utils/audio-files'
import { directUpload } from '~/lib/direct-upload'
import { prepareAudio, type UploadConversion } from '~/lib/prepare-audio'
import { tracksApi } from '~/services/api'

/** Where a replace has got to, in order; `error` can happen at any step. */
export type ReplaceStatus = 'idle' | 'analyzing' | 'converting' | 'uploading' | 'saving' | 'done' | 'error'

/** The statuses during which a replace is running (the dialog cannot be closed, leaving asks first). */
const RUNNING: ReplaceStatus[] = ['analyzing', 'converting', 'uploading', 'saving']

/**
 * Replace audio (the track editor's TrackReplaceAudioDialog, docs/07-data-flows.md
 * 7.19): swaps a track's audio file for a new one, such as its master,
 * keeping everything else (metadata, lyrics, cover, plays, votes, playlists,
 * share links). The same path as a new track's upload, for a track that
 * already exists:
 *   1. analysis and, for a WAV, the verified FLAC (lib/prepare-audio.ts);
 *      only what is measured is used (format, size, duration, peaks): the
 *      new file's tags are ignored, the track keeps its own metadata;
 *   2. POST /api/tracks/:id/audio/upload-url: an address for a key next to
 *      the track's current file, which keeps playing meanwhile;
 *   3. the file goes straight to the audio storage (R2), with retries;
 *   4. PUT /api/tracks/:id/audio: the server checks the stored file, moves
 *      the track to it (flagging synced lyrics for checking) and deletes the
 *      old file;
 *   5. the player gets the new data, and moves the loaded track to the new
 *      file at the same second (the old one is gone).
 * Any failure leaves the track on its old file, with the reason in `error`.
 */
export function useAudioReplace() {
  // The new data and the new file go to the player at the end.
  const player = usePlayerStore()

  /** Where the replace has got to. */
  const status = ref<ReplaceStatus>('idle')
  /** 0..1, progress of the WAV → FLAC conversion (encoding + verification). */
  const conversionProgress = ref(0)
  /** What the WAV → FLAC step did (null until then, and for other formats). */
  const conversion = ref<UploadConversion | null>(null)
  /** 0..1, upload progress of the new file. */
  const progress = ref(0)
  /** Why it failed, shown in the dialog; null otherwise. */
  const error = ref<string | null>(null)
  /** A replace is running: nothing else may start, and the dialog stays open. */
  const running = computed(() => RUNNING.includes(status.value))

  /** Back to the start (the dialog opened again, or another file chosen). */
  function reset(): void {
    status.value = 'idle'
    conversionProgress.value = 0
    conversion.value = null
    progress.value = 0
    error.value = null
  }

  /**
   * Replaces track `trackId`'s audio with `file`. Resolves to the updated
   * track once it plays the new file, or null when it failed (the reason is
   * in `error`, and the track is unchanged).
   */
  async function replace(trackId: string, file: File): Promise<TrackDetail | null> {
    if (running.value) return null
    reset()
    // Refused at once, with the upload's own messages: an unknown format, or past 500 MB.
    if (!resolveAudioMimeType(file)) return failWith('Unsupported format')
    if (file.size > MAX_AUDIO_BYTES) return failWith('File too large (max 500 MB)')

    try {
      status.value = 'analyzing'
      // Duration and peaks measured, a WAV turned into its verified FLAC.
      const prepared = await prepareAudio(file, {
        onConverting: () => {
          status.value = 'converting'
        },
        onConversionProgress: (fraction) => {
          conversionProgress.value = fraction
        },
      })
      conversion.value = prepared.conversion
      // What is uploaded, and the type it is stored with.
      const { file: audioFile, mimeType, analysis } = prepared

      status.value = 'uploading'
      // A presigned PUT address for a new key next to the track's current file.
      const target = await tracksApi.replaceUploadUrl(trackId, {
        extension: storageExtension(audioFile),
        mimeType,
        sizeBytes: audioFile.size,
      })
      await directUpload({
        url: target.uploadUrl,
        file: audioFile,
        contentType: mimeType,
        onProgress: (fraction) => {
          progress.value = fraction
        },
      })

      status.value = 'saving'
      // The track, now on the new file (its synced lyrics flagged for checking, if any).
      const updated = await tracksApi.replaceAudio(trackId, {
        audioPath: target.audioPath,
        mimeType,
        sizeBytes: audioFile.size,
        durationSeconds: analysis.durationSeconds,
        peaks: analysis.peaks,
      })
      await player.audioReplaced(updated)
      progress.value = 1
      status.value = 'done'
      return updated
    }
    catch (err) {
      return failWith(getErrorMessage(err, 'Replace failed'))
    }
  }

  /** Marks the replace failed with `message`; null, for replace() to return. */
  function failWith(message: string): null {
    status.value = 'error'
    error.value = message
    return null
  }

  return { status, conversionProgress, conversion, progress, error, running, replace, reset }
}
