/**
 * Reading a whole table in pages (server/repositories/pages.ts): PostgREST answers at most
 * PAGE_SIZE rows per request and cuts the rest silently, so lists are read page after page until
 * a short one. Checked with a fake query over more rows than one page holds.
 */
import { describe, expect, it, vi } from 'vitest'
import { PAGE_SIZE, readAllPages } from '~~/server/repositories/pages'

/** A fake paged query over `total` numbered rows, recording the ranges it was asked for. */
function fakeTable(total: number) {
  // Every range asked for, in order.
  const ranges: [number, number][] = []
  // `.range(from, to)` is inclusive, like PostgREST's.
  const page = vi.fn(async (from: number, to: number) => {
    ranges.push([from, to])
    return { data: Array.from({ length: Math.max(0, Math.min(to + 1, total) - from) }, (_, i) => from + i), error: null }
  })
  return { page, ranges }
}

describe('readAllPages', () => {
  it('reads every row of a table longer than one page, in order', async () => {
    // Two full pages and five rows more.
    const { page, ranges } = fakeTable(2 * PAGE_SIZE + 5)
    // Every row, read through the pages.
    const rows = await readAllPages(page, 'test.list')
    expect(rows).toHaveLength(2 * PAGE_SIZE + 5)
    expect(rows[0]).toBe(0)
    expect(rows.at(-1)).toBe(2 * PAGE_SIZE + 4)
    expect(ranges).toEqual([[0, PAGE_SIZE - 1], [PAGE_SIZE, 2 * PAGE_SIZE - 1], [2 * PAGE_SIZE, 3 * PAGE_SIZE - 1]])
  })

  it('stops after a short page, and asks once more when the last page is exactly full', async () => {
    expect((await readAllPages(fakeTable(3).page, 'test.list'))).toEqual([0, 1, 2])
    // A table exactly one page long.
    const full = fakeTable(PAGE_SIZE)
    expect(await readAllPages(full.page, 'test.list')).toHaveLength(PAGE_SIZE)
    // The table ends exactly at a page boundary: an empty page confirms it.
    expect(full.ranges).toHaveLength(2)
  })

  it('turns a database error into an HTTP error', async () => {
    // A query that always fails, as RLS would refuse it.
    const failing = async () => ({ data: null, error: { code: '42501', message: 'denied', details: '', hint: '', name: 'PostgrestError' } })
    await expect(readAllPages(failing, 'test.list')).rejects.toMatchObject({ statusCode: 403 })
  })
})
