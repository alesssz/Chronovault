import type { DbClient } from '../utils/auth'
import { isSafeStorageKey } from '~~/shared/utils/storage-paths'
import { toHttpError } from '../utils/errors'

/**
 * Supabase Storage access (covers). Buckets are private: files are only
 * reachable through signed URLs, and the storage RLS policies decide who may
 * sign them (the owner, or anyone for files of shared tracks/playlists).
 * Audio files live on Cloudflare R2 instead (see audio-storage.ts).
 * A path with `..` or an empty segment is never passed on (isSafeStorageKey),
 * whatever the database holds.
 */

/** Throws (500, logged) on a path that could name another file than it says. */
function assertSafePath(path: string, context: string): void {
  if (!isSafeStorageKey(path)) throw toHttpError({ message: `unsafe storage key ${JSON.stringify(path)}` }, context)
}

/**
 * Lifetime of signed URLs for audio streaming and covers (seconds): 6 hours,
 * long enough for a listening session. The player refreshes expired audio
 * URLs on its own.
 */
export const SIGNED_URL_TTL = 6 * 60 * 60

/** Signs one file; throws (500) when the file is missing, not readable by this client, or its path unsafe. */
export async function createSignedUrl(db: DbClient, bucket: string, path: string): Promise<string> {
  assertSafePath(path, `storage.sign:${bucket}`)
  // One signed URL, valid SIGNED_URL_TTL seconds.
  const { data, error } = await db.storage.from(bucket).createSignedUrl(path, SIGNED_URL_TTL)
  if (error) throw toHttpError({ message: error.message }, `storage.sign:${bucket}`)
  return data.signedUrl
}

/**
 * Signs URLs in bulk (one request for a whole library page); paths that fail,
 * or are unsafe, are simply left out, so a missing cover never breaks the list.
 */
export async function createSignedUrls(db: DbClient, bucket: string, paths: string[]): Promise<Map<string, string>> {
  // path → signed URL; a cover that fails is simply missing from the map.
  const result = new Map<string, string>()
  // Unsafe paths are left out like failing ones (a missing cover, never a broken list).
  const safe = paths.filter(isSafeStorageKey)
  if (safe.length === 0) return result
  // One request for every path; each entry has its URL or its own error.
  const { data, error } = await db.storage.from(bucket).createSignedUrls(safe, SIGNED_URL_TTL)
  if (error) {
    console.error(`[storage.signMany:${bucket}]`, error)
    return result
  }
  for (const item of data) {
    if (item.path && item.signedUrl && !item.error) result.set(item.path, item.signedUrl)
  }
  return result
}

/** A file of a Supabase Storage folder. */
export interface FolderFile {
  /** Full path inside the bucket (`<folder>/<name>`). */
  path: string
  /** Size in bytes (0 when Storage reports none). */
  size: number
  /** ISO timestamp of the last upload (an upsert updates it). */
  lastModified: string
}

/**
 * Files directly inside `folder` (sub-folders are skipped), page by page.
 * Storage RLS applies: a user can only list their own folder.
 */
export async function listFolderFiles(db: DbClient, bucket: string, folder: string): Promise<FolderFile[]> {
  // Storage list pages: keep asking until a short page comes back.
  const PAGE = 1000
  // Files of every page, collected in order.
  const files: FolderFile[] = []
  for (let offset = 0; ; offset += PAGE) {
    // One page of the folder, sorted by name so the pages follow each other.
    const { data, error } = await db.storage.from(bucket).list(folder, { limit: PAGE, offset, sortBy: { column: 'name', order: 'asc' } })
    if (error) throw toHttpError({ message: error.message }, `storage.list:${bucket}`)
    for (const item of data) {
      // Folders come back as entries without an id.
      if (!item.id) continue
      files.push({
        path: `${folder}/${item.name}`,
        size: Number((item.metadata as { size?: number } | null)?.size ?? 0),
        lastModified: item.updated_at ?? item.created_at ?? new Date(0).toISOString(),
      })
    }
    if (data.length < PAGE) return files
  }
}

/**
 * Downloads a file (with this client's rights: storage RLS applies), or null
 * when it is missing, not readable, or its path unsafe.
 */
export async function downloadObject(db: DbClient, bucket: string, path: string): Promise<Blob | null> {
  // A path that could name another file: refused (logged), like a missing one.
  if (!isSafeStorageKey(path)) {
    console.error(`[storage.download:${bucket}] unsafe storage key ${JSON.stringify(path)}`)
    return null
  }
  // The file's bytes, or an error when it is missing or not readable by this client.
  const { data, error } = await db.storage.from(bucket).download(path)
  if (error) {
    console.error(`[storage.download:${bucket}]`, error)
    return null
  }
  return data
}

/** Best-effort removal: a failure here must not block the main operation; unsafe paths are skipped. */
export async function removeObjects(db: DbClient, bucket: string, paths: string[]): Promise<void> {
  // Unsafe paths are never sent (logged instead).
  const safe = paths.filter((path) => {
    if (isSafeStorageKey(path)) return true
    console.error(`[storage.remove:${bucket}] unsafe storage key ${JSON.stringify(path)}`)
    return false
  })
  if (safe.length === 0) return
  // One request for every path; missing files are not an error.
  const { error } = await db.storage.from(bucket).remove(safe)
  if (error) console.error(`[storage.remove:${bucket}]`, error)
}
