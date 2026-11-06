#!/usr/bin/env node
/**
 * Adds a SEEKTABLE to the FLAC files already in the audio storage: the ones
 * converted from WAV before the encoder wrote one (see app/lib/flac/seektable.ts).
 * Without it a browser jumping into the middle of a track searches the file
 * with a string of range requests, seconds on a real network.
 *
 *   pnpm flac:seektable                       the local stack: lists what it would do
 *   pnpm flac:seektable --apply               …and does it
 *   pnpm flac:seektable --env .env.r2 [--apply]   production (Cloudflare R2)
 *
 * Without --env it works on the local stack's S3 endpoint (`supabase status`).
 * With --env it reads the audio storage from that file, with the names used on
 * Vercel and by `pnpm r2:check` (NUXT_AUDIO_STORAGE_ENDPOINT, _REGION, _BUCKET,
 * _ACCESS_KEY_ID, _SECRET_ACCESS_KEY).
 *
 * Storage only, never the database: the files are listed from the bucket
 * (ListObjectsV2, like the storage clean-up) and rewritten under the same key,
 * so every track still points to its file. A track's `size_bytes` keeps its
 * old value, a few hundred bytes short of the indexed file: it is only shown
 * (rounded, in the editor) and compared at registration, which new uploads
 * pass with their table already in; streaming, downloads and the Storage
 * dialog read the real size from the storage. Orphaned files (an interrupted
 * upload) get a table too, harmlessly: the clean-up deletes them anyway.
 *
 * For each .flac: download, add the table, check that the new file is the old
 * one plus that block (STREAMINFO's "last block" flag aside), upload it over
 * the old one, check its size in the storage. The audio frames never change; a
 * file already indexed, or one that cannot be indexed safely, is left as it is
 * with the reason. Safe to run again: indexed files are skipped.
 */
import { existsSync, readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { AwsClient } from 'aws4fetch'
import { addSeekTable } from '../app/lib/flac/seektable.ts'
import { localAudioStorageEnv, supabaseStatus } from './lib/local-stack.mjs'

const args = process.argv.slice(2)
/** Write the files; without it, only list what would be done. */
const apply = args.includes('--apply')
/** Env files given with --env (production). */
const envFiles = args.flatMap((arg, i) => (arg === '--env' && args[i + 1] ? [args[i + 1]] : []))

/** Stops with a message, nothing written. */
function fail(message) {
  console.error(`✖ ${message}`)
  process.exit(1)
}

// --- Configuration --------------------------------------------------------------------------
let storageEnv
if (envFiles.length) {
  storageEnv = {}
  for (const file of envFiles) {
    if (!existsSync(file)) {
      fail(`${file} not found. For R2: copy .env.r2.example to .env.r2 and fill it in with the values set on Vercel (NUXT_AUDIO_STORAGE_*).`)
    }
    // The file's own values only, never the shell's: a shell that loads the local .env by itself
    // (oh-my-zsh's dotenv plugin, direnv) already holds NUXT_AUDIO_STORAGE_*, which
    // process.loadEnvFile does not override, and the run went to the local stack instead of R2.
    Object.assign(storageEnv, parseEnv(readFileSync(file, 'utf8')))
  }
}
else {
  // The local stack: its S3 endpoint, straight from the CLI.
  const status = supabaseStatus()
  if (!status) fail('The local Supabase stack is not running (pnpm db:start), and no --env file was given.')
  storageEnv = localAudioStorageEnv(status)
}
const storage = {
  endpoint: storageEnv.NUXT_AUDIO_STORAGE_ENDPOINT?.replace(/\/$/, ''),
  region: storageEnv.NUXT_AUDIO_STORAGE_REGION || 'auto',
  bucket: storageEnv.NUXT_AUDIO_STORAGE_BUCKET,
  accessKeyId: storageEnv.NUXT_AUDIO_STORAGE_ACCESS_KEY_ID,
  secretAccessKey: storageEnv.NUXT_AUDIO_STORAGE_SECRET_ACCESS_KEY,
}
// Settings left empty.
const missing = Object.entries(storage).filter(([, v]) => !v).map(([k]) => k)
if (missing.length) fail(`Missing audio storage settings: ${missing.join(', ')}`)

// Signs storage requests like the app (aws4fetch, SigV4).
const s3 = new AwsClient({ ...storage, service: 's3' })
/** Path-style address of the bucket and of a stored file, like AudioStorage. */
const bucketUrl = `${storage.endpoint}/${encodeURIComponent(storage.bucket)}`
const objectUrl = key => `${bucketUrl}/${key.split('/').map(encodeURIComponent).join('/')}`

/** Decodes the five predefined XML entities (keys may contain `&`, `<`…). */
function decodeXml(text) {
  return text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, '\'').replace(/&amp;/g, '&')
}

/** Every .flac key of the bucket (ListObjectsV2, at most 1000 keys a page). */
async function flacKeys() {
  const keys = []
  let token = null
  do {
    const url = new URL(bucketUrl)
    url.searchParams.set('list-type', '2')
    if (token) url.searchParams.set('continuation-token', token)
    let response
    try {
      response = await s3.fetch(url.toString())
    }
    catch (error) {
      fail(`Could not reach the storage at ${bucketUrl}: ${error.cause?.message ?? error.message}`)
    }
    if (!response.ok) fail(`Could not list the bucket (${response.status}): ${await response.text()}`)
    const xml = await response.text()
    for (const [, key] of xml.matchAll(/<Key>([\s\S]*?)<\/Key>/g)) {
      const decoded = decodeXml(key)
      if (decoded.endsWith('.flac')) keys.push(decoded)
    }
    const next = /<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/.exec(xml)
    token = /<IsTruncated>true<\/IsTruncated>/.test(xml) && next ? decodeXml(next[1]) : null
  } while (token)
  return keys
}

/** The new file is the old one plus the table: same STREAMINFO (flag aside), same bytes after it. */
function onlyTableAdded(before, after, points) {
  const added = 4 + points * 18
  if (after.length !== before.length + added) return false
  for (let i = 0; i < 42; i++) {
    if (i === 4 ? (after[i] & 0x7f) !== (before[i] & 0x7f) : after[i] !== before[i]) return false
  }
  return Buffer.from(after.subarray(42 + added)).equals(Buffer.from(before.subarray(42)))
}

// --- Run ------------------------------------------------------------------------------------
console.log(`▸ ${apply ? 'Adding' : 'Checking (dry run, nothing written; --apply to write)'} seek tables: ${bucketUrl}`)
const keys = await flacKeys()
console.log(`  ${keys.length} FLAC file(s)`)
const counts = { added: 0, wouldAdd: 0, skipped: 0, failed: 0 }
for (const key of keys) {
  try {
    const download = await s3.fetch(objectUrl(key))
    if (!download.ok) throw new Error(`download answered ${download.status}`)
    const before = new Uint8Array(await download.arrayBuffer())
    const result = addSeekTable(before)
    if (result.status !== 'added') {
      counts.skipped++
      console.log(`  · ${key}: ${result.reason}`)
      continue
    }
    if (!onlyTableAdded(before, result.flac, result.points)) throw new Error('the new file differs from the old one beyond the table')
    if (!apply) {
      counts.wouldAdd++
      console.log(`  ○ ${key}: would add ${result.points} seek points (+${result.flac.length - before.length} B)`)
      continue
    }

    // Over the old file, then its size checked in the storage.
    const upload = await s3.fetch(objectUrl(key), {
      method: 'PUT',
      body: result.flac,
      headers: { 'content-type': 'audio/flac', 'content-length': String(result.flac.length) },
    })
    if (!upload.ok) throw new Error(`upload answered ${upload.status}: ${await upload.text()}`)
    const head = await s3.fetch(objectUrl(key), { method: 'HEAD' })
    if (Number(head.headers.get('content-length')) !== result.flac.length) throw new Error('the stored file does not have the new size')
    counts.added++
    console.log(`  ✔ ${key}: ${result.points} seek points (+${result.flac.length - before.length} B)`)
  }
  catch (error) {
    counts.failed++
    console.log(`  ✖ ${key}: ${error.message}`)
  }
}

console.log(apply
  ? `✔ Done: ${counts.added} indexed, ${counts.skipped} left as they were, ${counts.failed} failed.`
  : `✔ Dry run: ${counts.wouldAdd} to index, ${counts.skipped} left as they are, ${counts.failed} failed. Run again with --apply.`)
if (counts.failed) process.exitCode = 1
