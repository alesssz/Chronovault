/**
 * Storage usage and clean-up (the "Storage" dialog, /api/storage).
 *
 * An orphaned file is a file in the user's storage folders that no track or
 * playlist uses: typically an upload interrupted between the file transfer
 * and the track registration.
 */

/** Where a file lives: `audio` = Cloudflare R2, `covers` = Supabase Storage. */
export type StorageBucket = 'audio' | 'covers'

/** A stored file that no track or playlist uses. */
export interface OrphanFile {
  /** Which storage holds it. */
  bucket: StorageBucket
  /** Storage key, e.g. `<userId>/<trackId>.flac`. */
  path: string
  /** Its size in bytes (what deleting it frees). */
  sizeBytes: number
  /** ISO timestamp of the upload. */
  lastModified: string
  /** Old enough to be deleted (younger files may still be uploading). */
  deletable: boolean
}

/** File count and total bytes of one bucket. */
export interface StorageUsage {
  /** How many files. */
  files: number
  /** Their total size in bytes. */
  bytes: number
}

/** Response of GET /api/storage. */
export interface StorageReport {
  /** Everything stored in the user's folders, orphans included. */
  usage: Record<StorageBucket, StorageUsage>
  /** Oldest first. */
  orphans: OrphanFile[]
  /** Orphans younger than this are kept. */
  minAgeHours: number
}

/** Response of DELETE /api/storage/orphans. */
export interface StorageCleanupResult {
  /** Orphans deleted. */
  deletedFiles: number
  /** Bytes those orphans took. */
  freedBytes: number
  /** Orphans left in place because they are too recent. */
  keptFiles: number
}
