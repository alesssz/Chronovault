/**
 * Tags written into downloaded files (app/lib/tags): FLAC, MP3 and WAV.
 * Every written file is read back with music-metadata (an independent
 * parser, the one players-like tools use) and the audio part is checked to
 * be byte-identical to the original. Also file names and format detection.
 */
import { parseBuffer, TimestampFormat, type ILyricsTag } from 'music-metadata'
import { beforeAll, describe, expect, it } from 'vitest'
import { encodeWavToFlac, type FlacLib } from '~/lib/flac/encoder'
import { parseWav } from '~/lib/flac/wav'
import { readFlacBlocks, writeFlacTags } from '~/lib/tags/flac-tags'
import { writeMp3Tags } from '~/lib/tags/id3-tags'
import { downloadFileName, lrcFileName, tagFormatOf, type TrackTags } from '~/lib/tags/track-tags'
import { lyricsFromTags } from '~/lib/audio-analysis'
import { readWavChunks, writeWavTags } from '~/lib/tags/wav-tags'
import { buildWav, testSignal } from './wav-fixtures'

/** The start of a JPEG file: enough for tag writers and readers to recognise the picture type. */
const FAKE_JPEG = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xFF, 0xD9])

/** Every field filled, with non-ASCII text and multi-line lyrics. */
const tags: TrackTags = {
  title: 'Città di notte',
  artist: 'Chronovault, Ada',
  album: 'Notturni',
  year: 2026,
  genre: 'Ambient',
  comment: 'Written on a rainy night.',
  lyrics: '[Verse 1]\nFirst line\nSecond line',
  lyricsSynced: null,
  cover: { data: FAKE_JPEG, mimeType: 'image/jpeg', width: 800, height: 800 },
}

/** Synced lyrics as the sync editor stores them: the header takes its line's time. */
const SYNCED = [
  { time: 1.5, text: '[Verse 1]', section: true },
  { time: 1.5, text: 'First line' },
  { time: 63.25, text: 'Second line' },
]

/** Plain lyrics with a blank line between stanzas: kept apart from the synced ones. */
const PLAIN = '[Verse 1]\nFirst line\n\nSecond line'

/** libFLAC (asm.js build, runs in Node), to make real FLAC files. */
let Flac: FlacLib

beforeAll(async () => {
  // libflac.js, loaded once for every test (it is slow to start).
  const mod = await import('libflacjs/dist/libflac.js')
  Flac = ((mod as { default?: FlacLib }).default ?? mod) as FlacLib
  if (!Flac.isReady()) await new Promise<void>(resolve => Flac.on('ready', () => resolve()))
})

/** A real, verified FLAC: one second of 16-bit stereo. */
async function makeFlac(): Promise<Uint8Array> {
  // One second of a test signal, as a WAV.
  const wav = buildWav({ samples: testSignal(44_100, 2, 16), channels: 2, bitsPerSample: 16 })
  return (await encodeWavToFlac(Flac, wav, parseWav(wav))).flac
}

/**
 * A minimal MP3: valid MPEG-1 Layer III frame headers (128 kbps, 44.1 kHz,
 * 417 bytes per frame) with silent bodies, plus an old ID3v1 tag at the end.
 */
function makeMp3(): { file: Uint8Array, frames: Uint8Array } {
  // 20 frames: header bytes FF FB 90 64, then silence.
  const frames = new Uint8Array(417 * 20)
  for (let i = 0; i < 20; i++) frames.set([0xFF, 0xFB, 0x90, 0x64], i * 417)
  // ID3v1: "TAG" + a 30-byte title field, the rest left empty.
  const v1 = new Uint8Array(128)
  v1.set([0x54, 0x41, 0x47], 0) // "TAG"
  v1.set(new TextEncoder().encode('Old title'), 3)
  // Frames first, ID3v1 tag at the very end.
  const file = new Uint8Array(frames.length + v1.length)
  file.set(frames)
  file.set(v1, frames.length)
  return { file, frames }
}

describe('FLAC tags', () => {
  it('writes every field and the cover, readable by another parser', async () => {
    // The tagged file, read back by music-metadata (what other players see).
    const tagged = writeFlacTags(await makeFlac(), tags)
    const { common } = await parseBuffer(tagged, { mimeType: 'audio/flac' })

    expect(common.title).toBe('Città di notte')
    expect(common.artist).toBe('Chronovault, Ada')
    expect(common.composer).toEqual(['Chronovault, Ada'])
    expect(common.album).toBe('Notturni')
    expect(common.year).toBe(2026)
    expect(common.genre).toEqual(['Ambient'])
    expect(common.comment?.[0]?.text).toBe('Written on a rainy night.')
    expect(common.lyrics?.[0]?.text).toBe('[Verse 1]\nFirst line\nSecond line')
    expect(common.picture?.[0]?.format).toBe('image/jpeg')
    expect(Array.from(common.picture![0]!.data)).toEqual(Array.from(FAKE_JPEG))
  })

  it('keeps the audio frames and STREAMINFO byte for byte', async () => {
    // The file before and after tagging, and their metadata blocks.
    const original = await makeFlac()
    const tagged = writeFlacTags(original, tags)
    const before = readFlacBlocks(original)
    const after = readFlacBlocks(tagged)

    expect(Buffer.from(tagged.subarray(after.audioOffset)).equals(Buffer.from(original.subarray(before.audioOffset)))).toBe(true)
    expect(Buffer.from(after.blocks[0]!.body).equals(Buffer.from(before.blocks[0]!.body))).toBe(true)
  })

  it('replaces previous tags instead of adding a second set', async () => {
    // Tagged twice: the second set (new title, no cover) must replace the first.
    const once = writeFlacTags(await makeFlac(), tags)
    const twice = writeFlacTags(once, { ...tags, title: 'New title', cover: null })
    const { blocks } = readFlacBlocks(twice)
    const { common } = await parseBuffer(twice, { mimeType: 'audio/flac' })

    expect(blocks.filter(b => b.type === 4)).toHaveLength(1) // one VORBIS_COMMENT
    expect(blocks.filter(b => b.type === 6)).toHaveLength(0) // the cover was removed
    expect(common.title).toBe('New title')
  })

  it('leaves out empty fields', async () => {
    // Tagged with empty fields, read back.
    const tagged = writeFlacTags(await makeFlac(), { ...tags, album: null, genre: '  ', lyrics: null })
    const { common } = await parseBuffer(tagged, { mimeType: 'audio/flac' })
    expect(common.album).toBeUndefined()
    expect(common.genre).toBeUndefined()
    expect(common.lyrics).toBeUndefined()
  })

  it('refuses a file that is not a FLAC', () => {
    expect(() => writeFlacTags(new Uint8Array(100), tags)).toThrow('Not a FLAC file')
  })
})

describe('MP3 tags', () => {
  it('writes an ID3v2 tag readable by another parser, and drops the old ID3v1 tag', async () => {
    // A tiny MP3 with an old ID3v1 tag, its audio frames, and the tagged result read back.
    const { file, frames } = makeMp3()
    const tagged = writeMp3Tags(file, tags)
    const { common } = await parseBuffer(tagged, { mimeType: 'audio/mpeg' })

    expect(common.title).toBe('Città di notte')
    expect(common.artist).toBe('Chronovault, Ada')
    expect(common.album).toBe('Notturni')
    expect(common.year).toBe(2026)
    expect(common.genre).toEqual(['Ambient'])
    expect(common.comment?.[0]?.text).toBe('Written on a rainy night.')
    expect(common.lyrics?.[0]?.text).toBe('[Verse 1]\nFirst line\nSecond line')
    expect(common.picture?.[0]?.format).toBe('image/jpeg')
    // The MPEG frames come right after the new tag, unchanged, and nothing follows them.
    expect(Buffer.from(tagged.subarray(tagged.length - frames.length)).equals(Buffer.from(frames))).toBe(true)
    expect(Buffer.from(tagged).includes(Buffer.from('Old title'))).toBe(false)
  })

  it('replaces an existing ID3v2 tag', async () => {
    // A tiny MP3, tagged twice, read back.
    const { file } = makeMp3()
    const twice = writeMp3Tags(writeMp3Tags(file, tags), { ...tags, title: 'New title' })
    const { common } = await parseBuffer(twice, { mimeType: 'audio/mpeg' })
    expect(common.title).toBe('New title')
    // Only one "ID3" header in the file.
    expect(Buffer.from(twice).indexOf('ID3', 3)).toBe(-1)
  })
})

describe('WAV tags', () => {
  /** A 32-bit float WAV (the kind kept as WAV) with an existing INFO list. */
  function makeFloatWav(): Uint8Array {
    // An INFO list with one field: INAM = "Old" (NUL-terminated).
    const info = new Uint8Array([...new TextEncoder().encode('INFOINAM'), 4, 0, 0, 0, 0x4F, 0x6C, 0x64, 0])
    return buildWav({ samples: testSignal(1000, 1, 32), channels: 1, bitsPerSample: 32, formatTag: 3, extraChunk: { id: 'LIST', body: info } })
  }

  it('writes the text fields as RIFF INFO, readable by another parser', async () => {
    // A tagged float WAV, read back.
    const tagged = writeWavTags(makeFloatWav(), tags)
    const { common } = await parseBuffer(tagged, { mimeType: 'audio/wav' })

    expect(common.title).toBe('Città di notte') // Latin-1 covers Italian accents
    expect(common.artist).toBe('Chronovault, Ada')
    expect(common.album).toBe('Notturni')
    expect(common.genre).toEqual(['Ambient'])
    expect(common.comment?.[0]?.text).toBe('Written on a rainy night.')
  })

  it('replaces the old INFO list, keeps the audio data and fixes the RIFF size', () => {
    // The WAV before and after tagging, and the tagged file's chunks.
    const original = makeFloatWav()
    const tagged = writeWavTags(original, tags)
    const chunks = readWavChunks(tagged)
    /** The audio samples of a WAV file (its `data` chunk). */
    const data = (file: Uint8Array) => readWavChunks(file).find(c => c.id === 'data')!.body

    expect(chunks.filter(c => c.id === 'LIST')).toHaveLength(1)
    expect(chunks.map(c => c.id).indexOf('LIST')).toBeLessThan(chunks.map(c => c.id).indexOf('data'))
    expect(Buffer.from(data(tagged)).equals(Buffer.from(data(original)))).toBe(true)
    expect(new DataView(tagged.buffer).getUint32(4, true)).toBe(tagged.length - 8)
  })

  it('turns characters outside Latin-1 into "?"', async () => {
    // A title with characters Latin-1 cannot hold, read back.
    const tagged = writeWavTags(makeFloatWav(), { ...tags, title: 'Café 東京' })
    const { common } = await parseBuffer(tagged, { mimeType: 'audio/wav' })
    expect(common.title).toBe('Café ??')
  })
})

describe('tagFormatOf', () => {
  it.each([
    ['audio/flac', 'flac'],
    ['audio/mpeg', 'mp3'],
    ['audio/wav', 'wav'],
    ['audio/x-wav', 'wav'],
    ['audio/ogg', null],
    ['audio/mp4', null],
  ])('%s → %s', (mime, format) => {
    expect(tagFormatOf(mime)).toBe(format)
  })
})

describe('downloadFileName', () => {
  // A stored FLAC: the downloaded file keeps its extension.
  const path = 'user/track.flac'

  it('is "Composers - Title" with the stored extension', () => {
    expect(downloadFileName({ title: 'Night', composers: 'Ada', audioPath: path })).toBe('Ada - Night.flac')
    expect(downloadFileName({ title: 'Night', composers: null, audioPath: 'u/t.mp3' })).toBe('Night.mp3')
  })

  it('replaces characters file systems refuse, and trailing dots', () => {
    expect(downloadFileName({ title: 'A/B: "C"?*', composers: null, audioPath: path })).toBe('A_B_ _C___.flac')
    expect(downloadFileName({ title: 'Ends with dots...', composers: null, audioPath: path })).toBe('Ends with dots.flac')
  })

  it('keeps names short', () => {
    // The file name of a very long title.
    const name = downloadFileName({ title: 'x'.repeat(400), composers: null, audioPath: path })
    expect(name).toBe(`${'x'.repeat(150)}.flac`)
  })
})

describe('synced lyrics in downloaded files', () => {
  it('FLAC: LRC in LYRICS and the plain text in UNSYNCEDLYRICS, both read back on upload', async () => {
    // A FLAC with plain and synced lyrics, read back as the upload reads it.
    const tagged = writeFlacTags(await makeFlac(), { ...tags, lyrics: PLAIN, lyricsSynced: SYNCED })
    const { common } = await parseBuffer(tagged, { mimeType: 'audio/flac' })

    expect(lyricsFromTags(common.lyrics)).toEqual({ lyrics: PLAIN, lyricsSynced: SYNCED })
  })

  it('MP3: an SYLT frame next to the plain USLT lyrics, both read back on upload', async () => {
    // An MP3 with plain and synced lyrics, read back.
    const tagged = writeMp3Tags(makeMp3().file, { ...tags, lyrics: PLAIN, lyricsSynced: SYNCED })
    const { common } = await parseBuffer(tagged, { mimeType: 'audio/mpeg' })

    expect(lyricsFromTags(common.lyrics)).toEqual({ lyrics: PLAIN, lyricsSynced: SYNCED })
  })

  it('without synced lyrics, LYRICS is the plain text and nothing synced comes back', async () => {
    // A FLAC with plain lyrics only, read back.
    const tagged = writeFlacTags(await makeFlac(), tags)
    const { common } = await parseBuffer(tagged, { mimeType: 'audio/flac' })

    expect(lyricsFromTags(common.lyrics)).toEqual({ lyrics: tags.lyrics, lyricsSynced: null })
  })
})

describe('lyricsFromTags', () => {
  /** A synced lyrics tag as music-metadata returns it (times in ms). */
  function syncedTag(lines: [string, number][]): ILyricsTag {
    return {
      contentType: 1,
      timeStampFormat: TimestampFormat.milliseconds,
      syncText: lines.map(([text, timestamp]) => ({ text, timestamp })),
    } as ILyricsTag
  }

  it('uses the synced text as plain lyrics when there is no plain tag', () => {
    expect(lyricsFromTags([syncedTag([['Only line', 2000]])])).toEqual({
      lyrics: 'Only line',
      lyricsSynced: [{ time: 2, text: 'Only line' }],
    })
  })

  it('drops a sync the API would refuse instead of failing the upload', () => {
    // The lyrics read from a tag holding a line too long for the API.
    const result = lyricsFromTags([syncedTag([['x'.repeat(501), 0]])])
    expect(result.lyricsSynced).toBeNull()
    expect(result.lyrics).toBe('x'.repeat(501))
  })

  it('finds nothing in a file without lyrics', () => {
    expect(lyricsFromTags(undefined)).toEqual({ lyrics: null, lyricsSynced: null })
  })
})

describe('lrcFileName', () => {
  it('names an exported LRC like the audio download', () => {
    expect(lrcFileName({ title: 'Night', composers: 'Ada' })).toBe('Ada - Night.lrc')
    expect(lrcFileName({ title: 'A/B?', composers: null })).toBe('A_B_.lrc')
  })
})
