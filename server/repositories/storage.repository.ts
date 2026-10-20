import type { DbClient } from '../utils/auth'
import { toHttpError } from '../utils/errors'

/** Lifetime of signed URLs for audio and covers (seconds). */
export const SIGNED_URL_TTL = 6 * 60 * 60

export async function objectExists(db: DbClient, bucket: string, path: string): Promise<boolean> {
  const { data, error } = await db.storage.from(bucket).exists(path)
  // `exists` returns a 400/404 error when the file is missing: that means "does not exist".
  if (error) return false
  return data
}

export async function createSignedUrl(db: DbClient, bucket: string, path: string): Promise<string> {
  const { data, error } = await db.storage.from(bucket).createSignedUrl(path, SIGNED_URL_TTL)
  if (error) throw toHttpError({ message: error.message }, `storage.sign:${bucket}`)
  return data.signedUrl
}

/** Signs URLs in bulk; paths that fail are simply left out. */
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

/** Best-effort removal: a failure here must not block the main operation. */
export async function removeObjects(db: DbClient, bucket: string, paths: string[]): Promise<void> {
  if (paths.length === 0) return
  const { error } = await db.storage.from(bucket).remove(paths)
  if (error) console.error(`[storage.remove:${bucket}]`, error)
}
