#!/usr/bin/env node
/**
 * Checks a Cloudflare R2 (or any S3-compatible) audio storage configuration
 * end to end, exactly the way the app uses it:
 *   1. presigned PUT upload, its size and type signed, and a different file
 *      refused on that address     4. CORS for browser uploads (PUT)
 *   2. presigned GET with a range  5. CORS for streaming / waveform (GET + Range)
 *   3. HEAD (existence and size)   6. DELETE
 *
 * The configuration is read from .env.r2 (git-ignored), with the same
 * variable names used on Vercel:
 *   NUXT_AUDIO_STORAGE_ENDPOINT, NUXT_AUDIO_STORAGE_REGION, NUXT_AUDIO_STORAGE_BUCKET,
 *   NUXT_AUDIO_STORAGE_ACCESS_KEY_ID, NUXT_AUDIO_STORAGE_SECRET_ACCESS_KEY
 *
 * Usage:  pnpm r2:check [origin ...]     (default origin: http://localhost:3100)
 */
import { existsSync, readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { AwsClient } from 'aws4fetch'
import { storageConfig, WHERE_ON_CLOUDFLARE } from './lib/storage-env.mjs'

// The R2 settings live in a separate, git-ignored file: never in .env (local stack).
const envFile = '.env.r2'
if (!existsSync(envFile)) {
  console.error(`✖ ${envFile} not found. Create it from .env.r2.example and fill in your R2 values (from Cloudflare).`)
  process.exit(1)
}
// The file's own values only, never the shell's: a shell that loads the local .env by itself
// (oh-my-zsh's dotenv plugin, direnv) already holds NUXT_AUDIO_STORAGE_*, which
// process.loadEnvFile does not override, and the check ran on the local stack instead of R2.
// Same variable names as on Vercel, so the file can be copied there as is; checked before any
// request (empty values, placeholders such as Vercel's "[SENSITIVE]", an endpoint that is no URL).
const { config, problems } = storageConfig(parseEnv(readFileSync(envFile, 'utf8')))
if (problems.length) {
  console.error(`✖ ${envFile} is not ready:\n${problems.map(p => `  - ${p}`).join('\n')}`)
  console.error(`  Fill it in from Cloudflare:\n${WHERE_ON_CLOUDFLARE.map(w => `  - ${w}`).join('\n')}`)
  process.exit(1)
}

// Origins whose CORS access is checked (the sites the app is served from).
const origins = process.argv.slice(2).length ? process.argv.slice(2) : ['http://localhost:3100']
// Signs requests exactly like the app (aws4fetch, SigV4).
const client = new AwsClient({ ...config, service: 's3' })
// A throwaway object, deleted at the end whatever happens.
const key = `_chronovault-check/${Date.now()}.bin`
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

/**
 * Presigned URL for the test object, signed exactly like the app does (query
 * signature). `upload`: the file's size and type are signed too, as for the
 * app's upload addresses (AudioStorage.presign), so the storage takes only it.
 */
async function presign(method, upload) {
  // The lifetime goes in the query string, signed with it (like AudioStorage.presign).
  const url = new URL(objectUrl)
  url.searchParams.set('X-Amz-Expires', '600')
  return (await client.sign(url.toString(), {
    method,
    headers: upload ? { 'content-length': String(upload.size), 'content-type': upload.contentType } : undefined,
    aws: { signQuery: true, allHeaders: !!upload },
  })).url
}

console.log(`Checking bucket "${config.bucket}" at ${config.endpoint}\n`)

try {
  // 1. Upload, on an address signed for this file (size and type), like the app's.
  const uploadAddress = await presign('PUT', { size: body.length, contentType: 'audio/flac' })
  // Another file on the same address: twice as large. The storage must refuse it (the signature does not match).
  const larger = await fetch(uploadAddress, { method: 'PUT', body: new Uint8Array(body.length * 2), headers: { 'content-type': 'audio/flac' } })
  report(larger.status === 403, `An upload address refuses a file of another size (HTTP ${larger.status})`,
    'The storage ignored the signed size: uploads are not limited to the declared file. The app still checks the size when a track is registered.')
  const put = await fetch(uploadAddress, { method: 'PUT', body, headers: { 'content-type': 'audio/flac' } })
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
    // The browser's preflight before an upload: may this origin PUT?
    const putPreflight = await fetch(await presign('PUT'), {
      method: 'OPTIONS',
      headers: { 'origin': origin, 'access-control-request-method': 'PUT', 'access-control-request-headers': 'content-type' },
    })
    // The origin R2 allows for it (or `*`), null when none.
    const putAllowed = putPreflight.headers.get('access-control-allow-origin')
    report(putPreflight.ok && (putAllowed === origin || putAllowed === '*'), `CORS upload from ${origin}`,
      `Add "${origin}" to AllowedOrigins and PUT to AllowedMethods in the bucket CORS policy (see docs/13-deployment.md, 13.2).`)

    // The preflight before streaming: may this origin GET with a Range header?
    const getPreflight = await fetch(await presign('GET'), {
      method: 'OPTIONS',
      headers: { 'origin': origin, 'access-control-request-method': 'GET', 'access-control-request-headers': 'range' },
    })
    // The origin R2 allows for it (or `*`), null when none.
    const getAllowed = getPreflight.headers.get('access-control-allow-origin')
    report(getPreflight.ok && (getAllowed === origin || getAllowed === '*'), `CORS streaming / waveform from ${origin}`,
      `Allow GET and the "range" header for "${origin}" in the bucket CORS policy (see docs/13-deployment.md, 13.2).`)
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
