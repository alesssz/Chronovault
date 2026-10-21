import type { DbClient } from '../utils/auth'
import { toHttpError } from '../utils/errors'

/**
 * Supabase Storage access (covers). Buckets are private: files are only
 * reachable through signed URLs, and the storage RLS policies decide who may
 * sign them (the owner, or anyone for files of shared tracks/playlists).
 * Audio files live on Cloudflare R2 instead (see audio-storage.ts).
 */

/**
 * Lifetime of signed URLs for audio streaming and covers (seconds): 6 hours,
 * long enough for a listening session. The player refreshes expired audio
 * URLs on its own.
 */
export const SIGNED_URL_TTL = 6 * 60 * 60

/** Signs one file; throws (500) when the file is missing or not readable by this client. */
export async function createSignedUrl(db: DbClient, bucket: string, path: string): Promise<string> {
  const { data, error } = await db.storage.from(bucket).createSignedUrl(path, SIGNED_URL_TTL)
  if (error) throw toHttpError({ message: error.message }, `storage.sign:${bucket}`)
  return data.signedUrl
}

/**
 * Signs URLs in bulk (one request for a whole library page); paths that fail
 * are simply left out, so a missing cover never breaks the list.
 */
export async function createSignedUrls(db: DbClient, bucket: string, paths: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  if (paths.length === 0) return result
  const { data, error } = await db.storage.from(bucket).createSignedUrls(paths, SIGNED_URL_TTL)
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
  size: number
  /** ISO timestamp of the last upload (an upsert updates it). */
  lastModified: string
}

/**
 * Files directly inside `folder` (sub-folders are skipped), page by page.
 * Storage RLS applies: a user can only list their own folder.
 */
export async function listFolderFiles(db: DbClient, bucket: string, folder: string): Promise<FolderFile[]> {
  const PAGE = 1000
  const files: FolderFile[] = []
  for (let offset = 0; ; offset += PAGE) {
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

/** Best-effort removal: a failure here must not block the main operation. */
export async function removeObjects(db: DbClient, bucket: string, paths: string[]): Promise<void> {
  if (paths.length === 0) return
  const { error } = await db.storage.from(bucket).remove(paths)
  if (error) console.error(`[storage.remove:${bucket}]`, error)
}
