import type { DbClient } from '../utils/auth'
import { toHttpError } from '../utils/errors'

/**
 * The smallest real query the anonymous role may run, for the daily
 * keep-alive (server/api/keepalive.get.ts): Supabase pauses a Free-plan
 * project after a week without database activity, so the request has to
 * reach Postgres, not just the app.
 */

/**
 * Reads one built-in genre. The genres table fits the job: it is tiny, its
 * built-in rows always exist (they come with the schema), and RLS and the
 * grants let the anonymous role read them, so the query succeeds without a
 * session. Only an error matters; the row itself is thrown away.
 */
export async function pingDatabase(db: DbClient): Promise<void> {
  // `user_id IS NULL`: built-in genres only (RLS would hide the rest anyway); one row is enough.
  const { error } = await db.from('genres').select('id').is('user_id', null).limit(1)
  // An unreachable or refusing database becomes a 500, logged with its context: the cron logs show the failure.
  if (error) throw toHttpError(error, 'keepalive.ping')
}
