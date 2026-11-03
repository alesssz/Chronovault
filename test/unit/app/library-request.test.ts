/**
 * The library read (app/lib/library-request.ts), with a fake API: callers asking at the same
 * moment share one request; while the app opens, the read is shared even after it answered
 * (the queue restore asks first, the library page possibly later); once the first page is on
 * screen, a call after a read answered reads again (a refresh sees new tracks); and a failed
 * read is not kept for the next caller.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** The fake GET /api/tracks, the same function across the module reloads below. */
const list = vi.hoisted(() => vi.fn())
vi.mock('~/services/api', () => ({ tracksApi: { list } }))

/** A fresh copy of the module for each test: the startup state is per app session. */
let lib: typeof import('~/lib/library-request')

beforeEach(async () => {
  list.mockReset()
  vi.resetModules()
  lib = await import('~/lib/library-request')
})

describe('readLibrary while the app opens', () => {
  it('hands the read to a caller asking after it answered', async () => {
    list.mockResolvedValue([])

    // The queue restore asks first; the library page's code arrives after the answer.
    const restore = await lib.readLibrary()
    const page = await lib.readLibrary()

    expect(list).toHaveBeenCalledOnce()
    expect(page).toBe(restore)
  })

  it('reads again once the first page is on screen', async () => {
    list.mockResolvedValue([])
    await lib.readLibrary()
    lib.endStartupRead()
    await lib.readLibrary()
    expect(list).toHaveBeenCalledTimes(2)
  })

  it('does not keep a failed read: the next caller asks again', async () => {
    list.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([])
    await expect(lib.readLibrary()).rejects.toThrow('offline')
    await expect(lib.readLibrary()).resolves.toEqual([])
    expect(list).toHaveBeenCalledTimes(2)
  })
})

describe('readLibrary after the first page', () => {
  beforeEach(() => lib.endStartupRead())

  it('gives callers asking at the same moment the same single read', async () => {
    list.mockResolvedValue([])

    // Two callers asking together.
    const [first, second] = await Promise.all([lib.readLibrary(), lib.readLibrary()])

    expect(list).toHaveBeenCalledOnce()
    expect(first).toBe(second)
  })

  it('reads again once the previous read has answered', async () => {
    list.mockResolvedValue([])
    await lib.readLibrary()
    await lib.readLibrary()
    expect(list).toHaveBeenCalledTimes(2)
  })

  it('does not keep a failed read: the next caller asks again', async () => {
    list.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([])
    await expect(lib.readLibrary()).rejects.toThrow('offline')
    await expect(lib.readLibrary()).resolves.toEqual([])
    expect(list).toHaveBeenCalledTimes(2)
  })
})
