/**
 * `pnpm storage:clean` (scripts/lib/local-storage.mjs): which files on disk no object row of the
 * database points to, and the refusal when the disk's layout is not the expected one.
 */
import { describe, expect, it } from 'vitest'
import { findOrphans } from '../../../scripts/lib/local-storage.mjs'

const IN_USE = 'audio/u1/t1.flac/v1'
const COVER = 'covers/u1/t1.webp/v2'

describe('findOrphans', () => {
  it('keeps the files of every object, the other files are orphans', () => {
    const files = [IN_USE, COVER, 'audio/u1/t9.flac/v1', 'covers/u2/t3.webp/v1']
    expect(findOrphans(files, new Set([IN_USE, COVER]))).toEqual(['audio/u1/t9.flac/v1', 'covers/u2/t3.webp/v1'])
  })

  it('treats an older version of an object in use as an orphan', () => {
    expect(findOrphans([IN_USE, 'audio/u1/t1.flac/v0'], new Set([IN_USE]))).toEqual(['audio/u1/t1.flac/v0'])
  })

  it('finds every file orphaned when the database has no objects (after a database reset)', () => {
    expect(findOrphans([IN_USE, COVER], new Set())).toEqual([IN_USE, COVER])
  })

  it('finds nothing to delete when every file is in use, or there are none', () => {
    expect(findOrphans([IN_USE], new Set([IN_USE]))).toEqual([])
    expect(findOrphans([], new Set([IN_USE]))).toEqual([])
  })

  it('refuses when objects exist but no file matches one (another layout on disk)', () => {
    expect(() => findOrphans(['audio/u1/t1.flac'], new Set([IN_USE]))).toThrow(/layout/)
  })
})
