#!/usr/bin/env node
/**
 * Creates (or updates) the .env file with the URL and public key
 * of the local Supabase stack (`supabase status`).
 *
 * Usage:  pnpm env:local   or   make env
 */
import { resolve } from 'node:path'
import { publishableKey, supabaseStatus, writeEnvFile } from './lib/local-stack.mjs'

const status = supabaseStatus()
if (!status) {
  console.error('✖ Could not read the Supabase status. Is it running? Run first: make db-start')
  process.exit(1)
}

writeEnvFile(resolve(process.cwd(), '.env'), {
  SUPABASE_URL: status.API_URL,
  SUPABASE_KEY: publishableKey(status),
})
console.log(`✔ .env updated (${status.API_URL})`)
