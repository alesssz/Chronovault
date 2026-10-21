#!/usr/bin/env node
/**
 * Regenerates shared/types/database.types.ts from the local database schema.
 *
 * The file is only written when generation succeeds: a plain shell redirect
 * (`supabase gen types ... > file`) would truncate it whenever the database
 * is not running.
 *
 * Usage:  pnpm db:types   or   make db-types
 */
import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const target = resolve(process.cwd(), 'shared/types/database.types.ts')

// The generated TypeScript, kept in memory until we know it is valid.
let output
try {
  output = execSync('pnpm exec supabase gen types typescript --local', {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 10 * 1024 * 1024,
  })
}
catch (error) {
  console.error('✖ Type generation failed. Is the local database running? Try: make db-start')
  console.error(String(error.stderr || error.message).trim())
  process.exit(1)
}

if (!output.includes('export type Database')) {
  console.error('✖ Unexpected output from `supabase gen types`: file left untouched.')
  process.exit(1)
}

writeFileSync(target, output)
console.log(`✔ Types written to ${target}`)
