#!/usr/bin/env node
/**
 * Starting the local data afresh, all at once or one part at a time:
 *
 *   pnpm db:reset            everything: database and files. The stack is stopped without a
 *                            backup (its Docker volumes are deleted) and started again, so the
 *                            database comes back from the migrations and the seed (demo account
 *                            included) and the storage comes back empty
 *   pnpm db:reset:database   the database only (`supabase db reset`): the files stay on disk with
 *                            nothing pointing to them, for `pnpm storage:clean`
 *   pnpm storage:clean       the files only: deletes the ones no object row points to (left by a
 *                            database reset), keeping the database and every file it uses
 *
 * Each asks first, saying what goes; `--yes` (or `-y`) answers for scripts. The same commands
 * are `make db-reset`, `make db-reset-database`, `make storage-clean` (`yes=1` for `--yes`).
 */
import { resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import {
  ensureDocker,
  localAudioStorageEnv,
  publishableKey,
  runInherited,
  supabaseStatus,
  tryRun,
  writeEnvFile,
} from './lib/local-stack.mjs'
import { deleteFiles, findOrphans, listFiles, listObjects, projectId, storageRoot } from './lib/local-storage.mjs'

/** `--yes` (or `-y`): answer yes to the confirmation question. */
const assumeYes = process.argv.includes('--yes') || process.argv.includes('-y')

/** Asks a yes/no question in the terminal (`--yes` answers yes; no terminal = stop). */
async function confirm(question) {
  if (assumeYes) return true
  if (!process.stdin.isTTY) throw new Error('No terminal to ask for confirmation: run it again with --yes.')
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    return /^y(es)?$/i.test((await rl.question(question)).trim())
  }
  finally {
    rl.close()
  }
}

/** Fails unless the local stack is up: the database and storage parts work on its containers. */
function requireSupabase() {
  if (!supabaseStatus()) throw new Error('The local Supabase stack is not running: start it with `pnpm db:start`.')
}

/** Accounts and tracks in the local database, for the question before a reset. */
function counts(id) {
  const out = tryRun(`docker exec supabase_db_${id} psql -U postgres -tAc "select (select count(*) from auth.users) || ' accounts, ' || (select count(*) from public.tracks) || ' tracks'"`)
  return out?.trim() || 'every account and track'
}

/** `pnpm db:reset:database`: the database from the migrations and the seed; files untouched. */
async function database() {
  await ensureDocker()
  requireSupabase()
  const id = projectId()
  console.log(`The local database (${counts(id)}) is rebuilt from the migrations and the seed.`)
  console.log('The uploaded files stay on disk, unreachable: `pnpm storage:clean` deletes them.')
  if (!(await confirm('Reset the local database? [y/N] '))) return 0
  return runInherited('pnpm exec supabase db reset')
}

/** `pnpm storage:clean`: deletes the files no object row points to. */
async function storage() {
  await ensureDocker()
  requireSupabase()
  const id = projectId()
  const container = `supabase_storage_${id}`
  const root = storageRoot(container)
  const files = listFiles(container, root)
  const orphans = findOrphans(files, listObjects(`supabase_db_${id}`))
  console.log(`Local storage: ${files.length} files, ${files.length - orphans.length} in use, ${orphans.length} with no object pointing to them.`)
  if (orphans.length === 0) return 0
  if (!(await confirm(`Delete the ${orphans.length} unused files? [y/N] `))) return 0
  deleteFiles(container, root, orphans)
  console.log(`✔ ${orphans.length} files deleted`)
  return 0
}

/** `pnpm db:reset`: the stack's volumes deleted and created again: an empty database and storage. */
async function all() {
  await ensureDocker()
  const id = projectId()
  const running = supabaseStatus()
  console.log(`Everything local goes: the database (${running ? counts(id) : 'every account and track'}) and every uploaded file.`)
  console.log('The database comes back from the migrations and the seed, with the demo account.')
  if (!(await confirm('Reset all the local data? [y/N] '))) return 0

  console.log('▸ Stopping Supabase and deleting its data (Docker volumes)…')
  let code = await runInherited('pnpm exec supabase stop --no-backup')
  if (code !== 0) return code
  console.log('▸ Starting Supabase afresh: migrations and seed…')
  code = await runInherited('pnpm exec supabase start')
  const status = supabaseStatus()
  if (code !== 0 || !status) throw new Error('Supabase could not be started (see the output above).')
  // The keys come from supabase/config.toml and stay the same; written again all the same, as `pnpm local` does.
  writeEnvFile(resolve('.env'), {
    SUPABASE_URL: status.API_URL,
    SUPABASE_KEY: publishableKey(status),
    ...localAudioStorageEnv(status),
  })
  console.log('✔ Local data reset · .env updated · demo user: demo@chronovault.local / chronovault')
  return 0
}

// Dispatch on the first argument (`node scripts/reset-local.mjs all`).
const commands = { all, database, storage }
const command = commands[process.argv[2]]

if (!command) {
  console.error('Usage: node scripts/reset-local.mjs <all|database|storage> [--yes]')
  process.exit(1)
}

try {
  process.exitCode = await command()
}
catch (error) {
  console.error(`✖ ${error.message}`)
  process.exitCode = 1
}
