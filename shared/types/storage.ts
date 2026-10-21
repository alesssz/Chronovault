/**
 * Storage usage and clean-up (the "Storage" dialog, /api/storage).
 *
 * An orphaned file is a file in the user's storage folders that no track or
 * playlist uses: typically an upload interrupted between the file transfer
 * and the track registration.
 */

/** Where a file lives: `audio` = Cloudflare R2, `covers` = Supabase Storage. */
export type StorageBucket = 'audio' | 'covers'

export interface OrphanFile {
  bucket: StorageBucket
  /** Storage key, e.g. `<userId>/<trackId>.flac`. */
  path: string
  sizeBytes: number
  /** ISO timestamp of the upload. */
  lastModified: string
  /** Old enough to be deleted (younger files may still be uploading). */
  deletable: boolean
}

export interface StorageUsage {
  files: number
  bytes: number
}

export interface StorageReport {
  /** Everything stored in the user's folders, orphans included. */
  usage: Record<StorageBucket, StorageUsage>
  /** Oldest first. */
  orphans: OrphanFile[]
  /** Orphans younger than this are kept. */
  minAgeHours: number
}

export interface StorageCleanupResult {
  deletedFiles: number
  freedBytes: number
  /** Orphans left in place because they are too recent. */
  keptFiles: number
}
