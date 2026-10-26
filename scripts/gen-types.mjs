#!/usr/bin/env node
/**
 * Regenerates shared/types/database.types.ts from the local database schema.
 *
 * The file is only written when generation succeeds: a plain shell redirect
 * (`supabase gen types ... > file`) would truncate it whenever the database
 * is not running.
 *
 * With `--check` nothing is written: the script fails (exit 1) when the
 * committed file differs from what the schema gives, i.e. a migration was
 * added without `pnpm db:types`. CI runs it after applying the migrations,
 * since a stale file still typechecks and the query then fails at runtime.
 *
 * Usage:  pnpm db:types         or   make db-types         (write the file)
 *         pnpm db:types:check   or   make db-types-check   (compare only)
 */
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Where the generated types go.
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

// Compare only: the committed file must be exactly what the schema gives.
if (process.argv.includes('--check')) {
  if (readFileSync(target, 'utf8') !== output) {
    console.error('✖ shared/types/database.types.ts is out of date with the migrations: run pnpm db:types and commit it.')
    process.exit(1)
  }
  console.log('✔ Database types match the schema')
  process.exit(0)
}

writeFileSync(target, output)
console.log(`✔ Types written to ${target}`)
