#!/usr/bin/env node
/**
 * Writes .env.r2 (the production audio storage, for `pnpm r2:check` and
 * `pnpm flac:seektable --env .env.r2`) from the values the deployment
 * already uses: the NUXT_AUDIO_STORAGE_* variables of the Vercel project.
 *
 *   pnpm r2:env            writes .env.r2 (stops if it exists)
 *   pnpm r2:env --force    replaces it
 *
 * It runs the Vercel CLI through pnpm dlx (no global install), pinned below:
 * the first time it links this folder to the Vercel project (log in in the
 * browser, then pick the existing project: never create a new one), then
 * pulls the production variables into a temporary file, copies the five
 * NUXT_AUDIO_STORAGE_* into .env.r2 and deletes the temporary file at once
 * (it holds every production secret). Values are never printed.
 *
 * Variables marked "Sensitive" on Vercel come back empty from `vercel env
 * pull`: the script names them, to copy from Cloudflare (R2 → Manage API
 * Tokens: the token's Access Key ID and Secret Access Key) into .env.r2.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseEnv } from 'node:util'
import { writeEnvFile } from './lib/local-stack.mjs'

/** The Vercel CLI, pinned (a release at least two weeks old when chosen). */
const VERCEL = 'vercel@65.2.0'
/** The file written. */
const TARGET = '.env.r2'
/** What it holds: the audio storage settings, as named on Vercel. */
const NAMES = [
  'NUXT_AUDIO_STORAGE_ENDPOINT',
  'NUXT_AUDIO_STORAGE_REGION',
  'NUXT_AUDIO_STORAGE_BUCKET',
  'NUXT_AUDIO_STORAGE_ACCESS_KEY_ID',
  'NUXT_AUDIO_STORAGE_SECRET_ACCESS_KEY',
]

/** Stops with a message. */
function fail(message) {
  console.error(`✖ ${message}`)
  process.exit(1)
}

/** Runs the Vercel CLI with its prompts on this terminal; true when it succeeded. */
function vercel(...args) {
  return spawnSync('pnpm', ['dlx', VERCEL, ...args], { stdio: 'inherit', shell: process.platform === 'win32' }).status === 0
}

if (existsSync(TARGET) && !process.argv.includes('--force')) {
  fail(`${TARGET} already exists. Run with --force to replace it.`)
}

// This folder linked to the Vercel project (once: .vercel/ is git-ignored).
if (!existsSync('.vercel/project.json')) {
  console.log('▸ Linking this folder to the Vercel project: log in if asked, then choose the existing Chronovault project (do not create a new one).')
  if (!vercel('link')) fail('The folder could not be linked to the Vercel project.')
}

// The production variables, in a temporary folder removed whatever happens (before any exit:
// process.exit would skip a `finally`).
const folder = mkdtempSync(join(tmpdir(), 'chronovault-env-'))
let pulled = null
try {
  console.log('▸ Reading the production variables from Vercel…')
  const file = join(folder, 'production.env')
  if (vercel('env', 'pull', file, '--environment=production', '--yes')) pulled = parseEnv(readFileSync(file, 'utf8'))
}
finally {
  rmSync(folder, { recursive: true, force: true })
}
if (!pulled) fail('Could not read the variables from Vercel.')

// The five settings; the region defaults to R2's "auto".
const values = Object.fromEntries(NAMES.map(name => [name, pulled[name] ?? '']))
values.NUXT_AUDIO_STORAGE_REGION ||= 'auto'
writeEnvFile(TARGET, values)

const empty = NAMES.filter(name => !values[name])
if (empty.length) {
  console.log(`⚠ ${TARGET} written, but Vercel did not give these (probably marked "Sensitive"): ${empty.join(', ')}.`)
  console.log('  Copy them from Cloudflare (R2 → Manage API Tokens) into the file, then run pnpm r2:check.')
}
else {
  console.log(`✔ ${TARGET} written. Check it with: pnpm r2:check`)
}
