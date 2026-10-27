/**
 * The library read (app/lib/library-request.ts), with a fake API: callers asking at the same
 * moment share one request, a call after it answered reads again (a refresh sees new tracks),
 * and a failed read is not kept for the next caller.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { tracksApi } from '~/services/api'
import { readLibrary } from '~/lib/library-request'

vi.mock('~/services/api', () => ({
  tracksApi: { list: vi.fn() },
}))

beforeEach(() => {
  vi.mocked(tracksApi.list).mockReset()
})

describe('readLibrary', () => {
  it('gives callers asking at the same moment the same single read', async () => {
    vi.mocked(tracksApi.list).mockResolvedValue([])

    // The library page and the queue restore, asking together.
    const [page, restore] = await Promise.all([readLibrary(), readLibrary()])

    expect(tracksApi.list).toHaveBeenCalledOnce()
    expect(page).toBe(restore)
  })

  it('reads again once the previous read has answered', async () => {
    vi.mocked(tracksApi.list).mockResolvedValue([])
    await readLibrary()
    await readLibrary()
    expect(tracksApi.list).toHaveBeenCalledTimes(2)
  })

  it('does not keep a failed read: the next caller asks again', async () => {
    vi.mocked(tracksApi.list).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([])
    await expect(readLibrary()).rejects.toThrow('offline')
    await expect(readLibrary()).resolves.toEqual([])
    expect(tracksApi.list).toHaveBeenCalledTimes(2)
  })
})
