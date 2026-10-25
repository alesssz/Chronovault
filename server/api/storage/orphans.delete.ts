import { cleanStorage } from '../../services/storage-cleanup.service'

/**
 * DELETE /api/storage/orphans — deletes the user's orphaned files that are
 * old enough. The server scans again before deleting (the client's view is
 * not trusted); files used by a track or playlist are never touched.
 * Auth: signed-in user (401 otherwise); only the user's own folders.
 * 200 → StorageCleanupResult
 */
export default defineEventHandler(async (event) => {
  // The signed-in user, and a database client acting as them (RLS applies); 401 without a session.
  const { db, userId } = await requireAuth(event)
  return cleanStorage(db, useAudioStorage(), userId, orphanMinAgeHours())
})
