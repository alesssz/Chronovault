#!/usr/bin/env node
/**
 * Checks a Cloudflare R2 (or any S3-compatible) audio storage configuration
 * end to end, exactly the way the app uses it:
 *   1. presigned PUT upload        4. CORS for browser uploads (PUT)
 *   2. presigned GET with a range  5. CORS for streaming / waveform (GET + Range)
 *   3. HEAD (existence and size)   6. DELETE
 *
 * The configuration is read from .env.r2 (git-ignored), with the same
 * variable names used on Vercel:
 *   NUXT_AUDIO_STORAGE_ENDPOINT, NUXT_AUDIO_STORAGE_REGION, NUXT_AUDIO_STORAGE_BUCKET,
 *   NUXT_AUDIO_STORAGE_ACCESS_KEY_ID, NUXT_AUDIO_STORAGE_SECRET_ACCESS_KEY
 *
 * Usage:  pnpm r2:check [origin ...]     (default origin: http://localhost:3000)
 */
import { existsSync } from 'node:fs'
import { AwsClient } from 'aws4fetch'

// The R2 settings live in a separate, git-ignored file: never in .env (local stack).
const envFile = '.env.r2'
if (!existsSync(envFile)) {
  console.error(`✖ ${envFile} not found. Create it from .env.r2.example and fill in your R2 values.`)
  process.exit(1)
}
process.loadEnvFile(envFile)

// Same variable names as on Vercel, so the file can be copied there as is.
const config = {
  endpoint: process.env.NUXT_AUDIO_STORAGE_ENDPOINT?.replace(/\/$/, ''),
  region: process.env.NUXT_AUDIO_STORAGE_REGION || 'auto',
  bucket: process.env.NUXT_AUDIO_STORAGE_BUCKET,
  accessKeyId: process.env.NUXT_AUDIO_STORAGE_ACCESS_KEY_ID,
  secretAccessKey: process.env.NUXT_AUDIO_STORAGE_SECRET_ACCESS_KEY,
}
const missing = Object.entries(config).filter(([, v]) => !v).map(([k]) => k)
if (missing.length) {
  console.error(`✖ Missing in ${envFile}: ${missing.join(', ')}`)
  process.exit(1)
}

// Origins whose CORS access is checked (the sites the app is served from).
const origins = process.argv.slice(2).length ? process.argv.slice(2) : ['http://localhost:3000']
// Signs requests exactly like the app (aws4fetch, SigV4).
const client = new AwsClient({ ...config, service: 's3' })
// A throwaway object, deleted at the end whatever happens.
const key = `_chronoplayer-check/${Date.now()}.bin`
// Path-style URL of the test object, like AudioStorage.objectUrl().
const objectUrl = `${config.endpoint}/${config.bucket}/${key}`
// 4 KB of known bytes: the range check below expects bytes 100-109.
const body = new Uint8Array(4096).map((_, i) => i % 256)

// Failed checks; the exit code is 1 when any fails.
let failures = 0
/** Prints ✔/✖ for a check, with a hint on how to fix it; counts failures. */
function report(ok, label, hint) {
  console.log(`${ok ? '✔' : '✖'} ${label}`)
  if (!ok) {
    failures++
    if (hint) console.log(`    → ${hint}`)
  }
  return ok
}

/** Presigned URL for the test object, signed exactly like the app does (query signature). */
async function presign(method) {
  // The lifetime goes in the query string, signed with it (like AudioStorage.presign).
  const url = new URL(objectUrl)
  url.searchParams.set('X-Amz-Expires', '600')
  return (await client.sign(new Request(url, { method }), { aws: { signQuery: true } })).url
}

console.log(`Checking bucket "${config.bucket}" at ${config.endpoint}\n`)

try {
  // 1. Upload
  const put = await fetch(await presign('PUT'), { method: 'PUT', body, headers: { 'content-type': 'audio/flac' } })
  const uploaded = report(put.ok, `Presigned upload (HTTP ${put.status})`,
    put.status === 403
      ? 'Access denied: check the API token permissions (Object Read & Write on this bucket) and the keys in .env.r2.'
      : put.status === 404
        ? 'Bucket not found: check NUXT_AUDIO_STORAGE_BUCKET and the account ID in the endpoint.'
        : 'Check the endpoint (https://<ACCOUNT_ID>.r2.cloudflarestorage.com) and the keys.')

  if (uploaded) {
    // 2. Range download (what the audio player does)
    const get = await fetch(await presign('GET'), { headers: { range: 'bytes=100-109' } })
    const bytes = Array.from(new Uint8Array(await get.arrayBuffer()))
    report(get.status === 206 && bytes.join() === '100,101,102,103,104,105,106,107,108,109',
      `Presigned streaming with range requests (HTTP ${get.status})`)

    // 3. Existence and size (checked by the server when a track is registered)
    const head = await client.fetch(objectUrl, { method: 'HEAD' })
    report(head.ok && head.headers.get('content-length') === String(body.length), `HEAD returns the object size (HTTP ${head.status})`)
  }

  // 4–5. CORS, for every origin the app is served from
  for (const origin of origins) {
    const putPreflight = await fetch(await presign('PUT'), {
      method: 'OPTIONS',
      headers: { 'origin': origin, 'access-control-request-method': 'PUT', 'access-control-request-headers': 'content-type' },
    })
    const putAllowed = putPreflight.headers.get('access-control-allow-origin')
    report(putPreflight.ok && (putAllowed === origin || putAllowed === '*'), `CORS upload from ${origin}`,
      `Add "${origin}" to AllowedOrigins and PUT to AllowedMethods in the bucket CORS policy (see README).`)

    const getPreflight = await fetch(await presign('GET'), {
      method: 'OPTIONS',
      headers: { 'origin': origin, 'access-control-request-method': 'GET', 'access-control-request-headers': 'range' },
    })
    const getAllowed = getPreflight.headers.get('access-control-allow-origin')
    report(getPreflight.ok && (getAllowed === origin || getAllowed === '*'), `CORS streaming / waveform from ${origin}`,
      `Allow GET and the "range" header for "${origin}" in the bucket CORS policy (see README).`)
  }
}
finally {
  // 6. Cleanup
  const del = await client.fetch(objectUrl, { method: 'DELETE' })
  report(del.ok || del.status === 404, `Delete (HTTP ${del.status})`)
}

console.log(failures ? `\n✖ ${failures} check(s) failed.` : '\n✔ R2 is ready for Chronovault.')
// exitCode instead of process.exit(): exiting while sockets are still closing
// crashes Node 24 on Windows (libuv assertion).
process.exitCode = failures ? 1 : 0
