import type { PostgrestError } from '@supabase/supabase-js'
import { toHttpError } from '../utils/errors'

/**
 * Reading a whole table through PostgREST, which answers at most PAGE_SIZE
 * rows per request and cuts longer results silently: no error, just the
 * first rows. A list read in one request would quietly stop at 1000 items
 * (a library of 1001 tracks would show 1000; worse, the storage clean-up
 * would take the files of the others for orphans). Every list that can grow
 * with the user's data goes through readAllPages.
 */

/**
 * Most rows PostgREST returns per request (`max_rows` in supabase/config.toml,
 * the same default on Supabase Cloud).
 */
export const PAGE_SIZE = 1000

/**
 * Every row of a query, read PAGE_SIZE at a time. `page` runs the query for
 * one range of rows (`.range(from, to)`); it must order them by a unique key
 * (add the id after any other order), or pages could overlap or skip rows.
 * Errors become HTTP errors logged with `context`, like single queries.
 */
export async function readAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null, error: PostgrestError | null }>,
  context: string,
): Promise<T[]> {
  // Rows of the pages read so far.
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1)
    if (error) throw toHttpError(error, context)
    rows.push(...(data ?? []))
    // A short page is the last one.
    if (!data || data.length < PAGE_SIZE) return rows
  }
}
