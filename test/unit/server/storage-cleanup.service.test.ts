/**
 * Storage clean-up service with mocked repositories and a fake audio storage:
 * which files are orphans, the minimum age, usage totals, and that deletion
 * only ever touches old orphans.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DbClient } from '~~/server/utils/auth'
import type { AudioStorage, ListedObject } from '~~/server/repositories/audio-storage'
import * as tracksRepo from '~~/server/repositories/tracks.repository'
import * as playlistsRepo from '~~/server/repositories/playlists.repository'
import * as storageRepo from '~~/server/repositories/storage.repository'
import { cleanStorage, scanStorage } from '~~/server/services/storage-cleanup.service'

vi.mock('~~/server/repositories/tracks.repository')
vi.mock('~~/server/repositories/playlists.repository')
vi.mock('~~/server/repositories/storage.repository')

// The repositories are mocked: the client is never used.
const db = {} as DbClient
// Fixed user, "now" and two upload times: 3 days old (deletable) and 1 hour old (kept).
const USER = '11111111-1111-4111-8111-111111111111'
const NOW = Date.parse('2026-10-21T12:00:00Z')
const OLD = '2026-10-18T12:00:00.000Z' // 3 days
const RECENT = '2026-10-21T11:00:00.000Z' // 1 hour

/** The user's R2 folder: one file in use, one old orphan, one recent orphan. */
const objects: ListedObject[] = [
  { key: `${USER}/used.flac`, size: 1000, lastModified: OLD },
  { key: `${USER}/orphan-old.flac`, size: 500, lastModified: OLD },
  { key: `${USER}/orphan-new.flac`, size: 300, lastModified: RECENT },
]

// The fake listing of the audio storage: always `objects`.
const list = vi.fn(async (_prefix: string) => objects)
// The fake removal: records the keys it was asked to delete.
const remove = vi.fn(async (_keys: string[]) => {})
/** Fake R2 client: listing returns `objects`, removals are recorded. */
const audio = { list, remove } as unknown as AudioStorage

beforeEach(() => {
  vi.resetAllMocks()
  list.mockImplementation(async () => objects)
  vi.mocked(storageRepo.listFolderFiles).mockImplementation(async (_db, _bucket, folder) =>
    folder === USER
      ? [
          { path: `${USER}/used.webp`, size: 50, lastModified: OLD },
          { path: `${USER}/orphan.webp`, size: 40, lastModified: OLD },
        ]
      : [{ path: `${USER}/playlists/p1.webp`, size: 60, lastModified: OLD }])
  vi.mocked(tracksRepo.listTrackFilePaths).mockResolvedValue([
    { audio_path: `${USER}/used.flac`, cover_path: `${USER}/used.webp` },
  ])
  vi.mocked(playlistsRepo.listPlaylistCoverPaths).mockResolvedValue([`${USER}/playlists/p1.webp`])
})

describe('scanStorage', () => {
  it('reads only the user\'s folders', async () => {
    await scanStorage(db, audio, USER, 24, NOW)
    expect(list).toHaveBeenCalledWith(`${USER}/`)
    expect(storageRepo.listFolderFiles).toHaveBeenCalledWith(db, 'covers', USER)
    expect(storageRepo.listFolderFiles).toHaveBeenCalledWith(db, 'covers', `${USER}/playlists`)
  })

  it('reports files used by no track or playlist, oldest first, marking the recent ones as kept', async () => {
    // The scan with the usual 24-hour minimum age.
    const report = await scanStorage(db, audio, USER, 24, NOW)

    expect(report.orphans.map(o => [o.bucket, o.path, o.deletable])).toEqual([
      ['audio', `${USER}/orphan-old.flac`, true],
      ['covers', `${USER}/orphan.webp`, true],
      ['audio', `${USER}/orphan-new.flac`, false],
    ])
    expect(report.minAgeHours).toBe(24)
  })

  it('totals what the user stores, orphans included', async () => {
    // The usage part of the scan.
    const { usage } = await scanStorage(db, audio, USER, 24, NOW)
    expect(usage.audio).toEqual({ files: 3, bytes: 1800 })
    expect(usage.covers).toEqual({ files: 3, bytes: 150 })
  })

  it('with a minimum age of 0 every orphan is deletable', async () => {
    // The orphans, with no minimum age.
    const { orphans } = await scanStorage(db, audio, USER, 0, NOW)
    expect(orphans.every(o => o.deletable)).toBe(true)
  })
})

describe('cleanStorage', () => {
  it('deletes only old orphans, each from its own storage', async () => {
    // The clean-up with the usual 24-hour minimum age.
    const result = await cleanStorage(db, audio, USER, 24, NOW)

    expect(remove).toHaveBeenCalledWith([`${USER}/orphan-old.flac`])
    expect(storageRepo.removeObjects).toHaveBeenCalledWith(db, 'covers', [`${USER}/orphan.webp`])
    expect(result).toEqual({ deletedFiles: 2, freedBytes: 540, keptFiles: 1 })
  })

  it('never deletes a file a track uses, even an old one', async () => {
    await cleanStorage(db, audio, USER, 0, NOW)
    // Every key deleted from each storage.
    const deletedAudio = remove.mock.calls.flatMap(([keys]) => keys)
    const deletedCovers = vi.mocked(storageRepo.removeObjects).mock.calls.flatMap(([, , paths]) => paths)
    expect(deletedAudio).not.toContain(`${USER}/used.flac`)
    expect(deletedCovers).not.toContain(`${USER}/used.webp`)
    expect(deletedCovers).not.toContain(`${USER}/playlists/p1.webp`)
  })

  it('stops (deletes nothing) when the storage cannot be listed', async () => {
    list.mockRejectedValue(new Error('Audio storage LIST failed (403)'))
    await expect(cleanStorage(db, audio, USER, 24, NOW)).rejects.toThrow('LIST failed')
    expect(remove).not.toHaveBeenCalled()
    expect(storageRepo.removeObjects).not.toHaveBeenCalled()
  })
})
