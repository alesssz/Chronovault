/**
 * Deletes every test account, before and after each run (Playwright's globalSetup and
 * globalTeardown): the e2e tests share the local stack used for development, and each test signs
 * up an account of its own (signUp: `e2e-…@chronovault.test`). Before the run too, so a run that
 * was interrupted (Ctrl+C, a crash) leaves nothing behind once the next one starts.
 *
 * A test account is any address at `@chronovault.test`, the domain kept for them; the demo
 * account (`@chronovault.local`) and any real one stay. With each account go its tracks,
 * playlists, plays and votes (foreign keys on delete cascade), its objects in Storage and their
 * files on disk, which Storage keeps under a folder named after the user in each bucket.
 */
import { execFileSync } from 'node:child_process'
import { projectId, storageRoot } from '../../scripts/lib/local-storage.mjs'

/** The domain every test account is created at. */
const TEST_DOMAIN = '@chronovault.test'

/**
 * One transaction: the accounts' objects (Storage refuses direct deletes unless asked
 * explicitly: its rows are how it finds files), then the accounts with everything that is
 * theirs. Prints the ids deleted, for their folders on disk.
 */
const DELETE_SQL = `
begin;
create temporary table gone on commit drop as
  select id::text as id from auth.users where email like '%${TEST_DOMAIN}';
set local storage.allow_delete_query = 'true';
delete from storage.objects where split_part(name, '/', 1) in (select id from gone);
delete from auth.users where id::text in (select id from gone);
select id from gone;
commit;
`

/** Runs `docker` with these arguments (and stdin); returns its stdout. */
function docker(args: string[], input?: string): string {
  return execFileSync('docker', args, { encoding: 'utf8', input, maxBuffer: 64 * 1024 * 1024 })
}

export default function deleteTestAccounts(): void {
  try {
    const id = projectId()
    const ids = docker(['exec', '-i', `supabase_db_${id}`, 'psql', '-U', 'postgres', '-tAq', '-v', 'ON_ERROR_STOP=1', '-f', '-'], DELETE_SQL)
      .split('\n').map(line => line.trim()).filter(Boolean)
    if (ids.length === 0) return
    // The accounts' folders in every bucket (`<root>/<bucket>/<user id>/…`), ids through stdin.
    const container = `supabase_storage_${id}`
    docker(['exec', '-i', container, 'sh', '-c', 'cd "$1" && while read -r id; do rm -rf -- */"$id"; done', 'sh', storageRoot(container)], `${ids.join('\n')}\n`)
    console.log(`Test accounts deleted: ${ids.length}, with their tracks and files.`)
  }
  catch (error) {
    // Never in the way of the tests: what is left goes with the next run.
    console.warn(`⚠ Test accounts not deleted: ${(error as Error).message.split('\n')[0]}`)
  }
}
