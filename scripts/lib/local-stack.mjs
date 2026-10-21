/**
 * Helpers shared by the local-stack scripts: Docker detection, the local
 * Supabase stack status and .env files.
 */
import { execSync, spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

/**
 * Runs a command and returns its stdout, or null when it fails or takes longer
 * than `timeoutMs` (the Docker CLI can hang while Docker Desktop is still starting).
 */
export function tryRun(command, timeoutMs = 30_000) {
  try {
    return execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: timeoutMs })
  }
  catch {
    return null
  }
}

/** Runs a command with inherited output; resolves with its exit code. */
export function runInherited(command) {
  return new Promise((resolve) => {
    const child = spawn(command, { stdio: 'inherit', shell: true })
    child.on('exit', code => resolve(code ?? 1))
  })
}

/** Promise-based delay. */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** True when the Docker engine answers (Docker Desktop running and ready). */
export function dockerIsRunning() {
  return tryRun('docker info --format "{{.ServerVersion}}"', 10_000) !== null
}

/**
 * Fails with a clear message when the Docker engine is not reachable.
 * Docker Desktop is never started automatically: the user opens it.
 */
export function ensureDocker() {
  if (dockerIsRunning()) return
  throw new Error(
    'Docker is not running. Open Docker Desktop, wait until the engine is running, then run the command again.',
  )
}

/** Status of the local Supabase stack, or null when it is not running. */
export function supabaseStatus() {
  const raw = tryRun('pnpm exec supabase status -o json')
  // The CLI may print notices (e.g. "a new version is available") before the JSON.
  if (!raw || !raw.includes('{')) return null
  try {
    const status = JSON.parse(raw.slice(raw.indexOf('{')))
    return status.API_URL ? status : null
  }
  catch {
    return null
  }
}

/** Starts the local Supabase stack unless it is already running; returns its status. */
export async function ensureSupabase() {
  // Already up (e.g. started by a previous command): nothing to do.
  let status = supabaseStatus()
  if (status) {
    console.log('✔ Supabase is already running')
    return status
  }
  console.log('▸ Starting Supabase (the first run downloads the Docker images)…')
  const code = await runInherited('pnpm exec supabase start')
  status = supabaseStatus()
  if (code !== 0 || !status) throw new Error('Supabase could not be started (see the output above).')
  return status
}

/** The public client key: `PUBLISHABLE_KEY` on recent CLIs, `ANON_KEY` on older ones. */
export function publishableKey(status) {
  return status.PUBLISHABLE_KEY ?? status.ANON_KEY
}

/**
 * Audio storage settings for local development: the S3 endpoint of the local
 * Supabase stack (same protocol as Cloudflare R2, used in production).
 * `hostname` replaces 127.0.0.1 when the app runs inside a container.
 */
export function localAudioStorageEnv(status, hostname) {
  // The local S3 endpoint of Supabase Storage (stands in for Cloudflare R2).
  const endpoint = new URL(status.STORAGE_S3_URL)
  if (hostname) endpoint.hostname = hostname
  return {
    NUXT_AUDIO_STORAGE_ENDPOINT: endpoint.href.replace(/\/$/, ''),
    NUXT_AUDIO_STORAGE_REGION: status.S3_PROTOCOL_REGION ?? 'local',
    NUXT_AUDIO_STORAGE_BUCKET: 'audio',
    NUXT_AUDIO_STORAGE_ACCESS_KEY_ID: status.S3_PROTOCOL_ACCESS_KEY_ID,
    NUXT_AUDIO_STORAGE_SECRET_ACCESS_KEY: status.S3_PROTOCOL_ACCESS_KEY_SECRET,
  }
}

/** Sets the given variables in an env file, keeping any other line already there. */
export function writeEnvFile(path, values) {
  const lines = existsSync(path) ? readFileSync(path, 'utf8').split(/\r?\n/) : []
  // Variables already present in the file (updated in place).
  const seen = new Set()
  const updated = lines.map((line) => {
    const key = line.split('=')[0]?.trim()
    if (key && key in values) {
      seen.add(key)
      return `${key}=${values[key]}`
    }
    return line
  })
  for (const [key, value] of Object.entries(values)) {
    if (!seen.has(key)) updated.push(`${key}=${value}`)
  }
  // Exactly one trailing newline.
  while (updated.length && updated.at(-1) === '') updated.pop()
  writeFileSync(path, `${updated.join('\n')}\n`)
}

/** Waits until a URL answers with HTTP 2xx. */
export async function waitForUrl(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return true
    }
    catch {
      // Not up yet.
    }
    await sleep(2000)
  }
  return false
}
