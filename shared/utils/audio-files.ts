/**
 * Accepted audio formats and MIME type resolution.
 * Some systems (e.g. Windows with FLAC files) leave `File.type` empty:
 * in that case the type is derived from the extension.
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

/** Value for the `accept` attribute of file inputs. */
export const AUDIO_ACCEPT = ['audio/*', ...Object.keys(AUDIO_EXTENSIONS).map(ext => `.${ext}`)].join(',')

/** Maximum audio file size (must match the bucket limit). */
export const MAX_AUDIO_BYTES = 500 * 1024 * 1024

export function getExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot === -1 ? '' : fileName.slice(dot + 1).toLowerCase()
}

/**
 * Returns the audio MIME type of the file, or `null` when the format is not supported.
 */
export function resolveAudioMimeType(file: { name: string, type: string }): string | null {
  if (file.type.startsWith('audio/')) return file.type
  return AUDIO_EXTENSIONS[getExtension(file.name)] ?? null
}

/** Extension used in the storage path. */
export function storageExtension(file: { name: string, type: string }): string {
  const ext = getExtension(file.name)
  if (ext in AUDIO_EXTENSIONS) return ext
  const mime = resolveAudioMimeType(file)
  const match = Object.entries(AUDIO_EXTENSIONS).find(([, type]) => type === mime)
  return match?.[0] ?? 'bin'
}

/** Fallback title from the file name: no extension, underscores turned into spaces. */
export function titleFromFileName(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  const base = dot > 0 ? fileName.slice(0, dot) : fileName
  return base.replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Untitled'
}
