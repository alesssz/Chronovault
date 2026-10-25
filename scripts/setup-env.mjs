#!/usr/bin/env node
/**
 * Creates (or updates) the .env file from the local Supabase stack
 * (`supabase status`): Supabase URL and public key, plus the audio storage,
 * which locally is Supabase's S3 endpoint (Cloudflare R2 in production).
 *
 * Usage:  pnpm env:local   or   make env
 */
import { resolve } from 'node:path'
import { localAudioStorageEnv, publishableKey, supabaseStatus, writeEnvFile } from './lib/local-stack.mjs'

// The running stack's URLs and keys (null when it is not running).
const status = supabaseStatus()
if (!status) {
  console.error('✖ Could not read the Supabase status. Is it running? Run first: make db-start')
  process.exit(1)
}

writeEnvFile(resolve(process.cwd(), '.env'), {
  SUPABASE_URL: status.API_URL,
  SUPABASE_KEY: publishableKey(status),
  ...localAudioStorageEnv(status),
})
console.log(`✔ .env updated (${status.API_URL})`)
