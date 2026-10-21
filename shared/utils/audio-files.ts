/**
 * Accepted audio formats and MIME type resolution.
 *
 * Used by both sides:
 * - the browser, to filter dropped files and to pick the storage extension;
 * - the server, to validate `POST /api/tracks/upload-url` (the extension must
 *   be one of the keys below, see `audioUploadRequestSchema`).
 *
 * Some systems (e.g. Windows with FLAC files) leave `File.type` empty:
 * in that case the type is derived from the extension.
 */

/**
 * Supported file extensions and the MIME type each one is stored with.
 * Several extensions may share a container type (m4a/mp4, ogg/oga/opus).
 */
export const AUDIO_EXTENSIONS: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  flac: 'audio/flac',
  aac: 'audio/aac',
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  webm: 'audio/webm',
}

/**
 * Value for the `accept` attribute of file inputs: any `audio/*` type plus
 * the explicit extensions, so files with an empty `File.type` can still be
 * picked in the system dialog.
 */
export const AUDIO_ACCEPT = ['audio/*', ...Object.keys(AUDIO_EXTENSIONS).map(ext => `.${ext}`)].join(',')

/**
 * Maximum audio file size: 500 MB. It must match the local `audio` bucket
 * limit (supabase/migrations/…_storage.sql); on Cloudflare R2 the limit is
 * enforced by the API, which checks the uploaded size before registering a track.
 */
export const MAX_AUDIO_BYTES = 500 * 1024 * 1024

/** Lower-cased extension without the dot (`'Song.FLAC'` → `'flac'`), or `''` when there is none. */
export function getExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot === -1 ? '' : fileName.slice(dot + 1).toLowerCase()
}

/**
 * Returns the audio MIME type of the file, or `null` when the format is not supported.
 * The browser-provided type wins when it is an audio type; otherwise the
 * extension decides (empty or generic types such as `application/octet-stream`).
 */
export function resolveAudioMimeType(file: { name: string, type: string }): string | null {
  if (file.type.startsWith('audio/')) return file.type
  return AUDIO_EXTENSIONS[getExtension(file.name)] ?? null
}

/**
 * Extension used in the storage path (`<userId>/<trackId>.<ext>`).
 * The file's own extension when it is a known one; otherwise the first
 * extension matching its MIME type; `bin` as a last resort (the server would
 * then reject it, since `bin` is not an accepted extension).
 */
export function storageExtension(file: { name: string, type: string }): string {
  const ext = getExtension(file.name)
  if (ext in AUDIO_EXTENSIONS) return ext
  const mime = resolveAudioMimeType(file)
  const match = Object.entries(AUDIO_EXTENSIONS).find(([, type]) => type === mime)
  return match?.[0] ?? 'bin'
}

/**
 * Fallback title from the file name, used when the file has no title tag:
 * no extension, underscores turned into spaces, repeated spaces collapsed.
 * `'my_new__song.wav'` → `'my new song'`; an empty result becomes `'Untitled'`.
 */
export function titleFromFileName(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  // `dot > 0`: a name such as `.wav` (dot first) is kept whole instead of becoming empty.
  const base = dot > 0 ? fileName.slice(0, dot) : fileName
  return base.replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Untitled'
}
