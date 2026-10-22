/**
 * Byte-array helpers for the code that reads and writes binary files in the
 * browser: the WAV parser and FLAC encoder (lib/flac), the tag writers
 * (lib/tags) and downloads streamed in chunks (useTrackDownload).
 */

/** Joins byte arrays into one new buffer of their total length, in order. */
export function concatBytes(parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  // One buffer of the total size, filled part after part.
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.byteLength
  }
  return out
}

/**
 * `length` bytes at `offset` read as ASCII characters: the 4-character ids
 * of RIFF chunks (`RIFF`, `fmt `, `data`) and file signatures (`fLaC`).
 */
export function asciiAt(bytes: Uint8Array, offset: number, length = 4): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length))
}
