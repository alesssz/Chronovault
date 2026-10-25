import { scanStorage } from '../../services/storage-cleanup.service'

/**
 * GET /api/storage — the user's storage usage (audio on R2, covers) and the
 * orphaned files (no track or playlist uses them), each marked deletable or
 * too recent.
 * Auth: signed-in user (401 otherwise); only the user's own folders are read.
 * 200 → StorageReport
 */
export default defineEventHandler(async (event) => {
  // The signed-in user, and a database client acting as them (RLS applies); 401 without a session.
  const { db, userId } = await requireAuth(event)
  return scanStorage(db, useAudioStorage(), userId, orphanMinAgeHours())
})
