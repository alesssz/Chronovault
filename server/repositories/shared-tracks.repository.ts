import type { DbClient } from '../utils/auth'
import { toHttpError } from '../utils/errors'
import type { SharedTrackRow } from '../mappers/track'

/**
 * Tracks shared by link ('unlisted' and 'public'), for anyone, signed in or
 * not. Goes through the get_shared_track() database function: it never
 * returns private tracks, nor the fields that are never shared.
 */
export async function findSharedTrackRow(db: DbClient, id: string): Promise<SharedTrackRow | null> {
  const { data, error } = await db.rpc('get_shared_track', { p_track_id: id }).maybeSingle()
  if (error) throw toHttpError(error, 'sharedTracks.find')
  return data
}
