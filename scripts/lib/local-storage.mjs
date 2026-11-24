/**
 * The local Storage's files on disk, for `pnpm storage:clean` (scripts/reset-local.mjs).
 *
 * Locally, Supabase Storage keeps each object as a file in its container, at
 * <root>/<bucket>/<object name>/<version> (the `file` backend), and the object's
 * row in `storage.objects` holds the same bucket, name and version. Storage only
 * ever lists objects through their rows, so a file whose row is gone (after
 * `supabase db reset`) can be neither reached nor deleted through it: only on disk.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

/** The Supabase project id (`project_id` in supabase/config.toml): it names the stack's containers. */
export function projectId(configPath = 'supabase/config.toml') {
  const id = /^project_id\s*=\s*"([^"]+)"/m.exec(readFileSync(configPath, 'utf8'))?.[1]
  if (!id) throw new Error(`No project_id in ${configPath}.`)
  return id
}

/** Runs `docker` with these arguments; returns its stdout. Throws when it fails. */
function docker(args, input) {
  return execFileSync('docker', args, { encoding: 'utf8', input, maxBuffer: 256 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] })
}

/**
 * The folder holding the buckets inside the storage container, from the container's own
 * settings (backend path, tenant, bucket) rather than a fixed path: `/mnt/stub/stub` today.
 */
export function storageRoot(container) {
  const env = Object.fromEntries(docker(['exec', container, 'env']).split('\n').map((line) => {
    const at = line.indexOf('=')
    return [line.slice(0, at), line.slice(at + 1)]
  }))
  if (env.STORAGE_BACKEND !== 'file' || !env.FILE_STORAGE_BACKEND_PATH) {
    throw new Error(`${container} does not keep its files on disk (STORAGE_BACKEND=${env.STORAGE_BACKEND ?? 'unset'}).`)
  }
  return [env.FILE_STORAGE_BACKEND_PATH, env.TENANT_ID, env.GLOBAL_S3_BUCKET].filter(Boolean).join('/')
}

/** Every file under `root` in the container, as paths relative to it (`audio/<user>/<track>.flac/<version>`). */
export function listFiles(container, root) {
  return docker(['exec', container, 'find', root, '-type', 'f', '-print0'])
    .split('\0')
    .filter(Boolean)
    .map(path => path.slice(root.length + 1))
}

/** Every object the database knows, as `<bucket>/<name>/<version>`: the path its file has on disk. */
export function listObjects(dbContainer) {
  const out = docker(['exec', dbContainer, 'psql', '-U', 'postgres', '-tAc', `select bucket_id || '/' || name || '/' || version from storage.objects`])
  return new Set(out.split('\n').map(line => line.trim()).filter(Boolean))
}

/**
 * The files no row points to. Refuses when rows exist but none matches a file: the
 * container then lays its files out some other way (a new Storage version), and every
 * file would look orphaned, the ones in use included.
 */
export function findOrphans(files, objects) {
  const orphans = files.filter(path => !objects.has(path))
  if (objects.size > 0 && orphans.length === files.length && files.length > 0) {
    throw new Error('No file on disk matches an object of the database: the storage layout is not the expected one, nothing was deleted.')
  }
  return orphans
}

/** Deletes these files (relative to `root`), then the folders left empty; the bucket folders stay. */
export function deleteFiles(container, root, paths) {
  // The list goes through stdin, NUL-separated: no command-line length limit, no quoting.
  docker(['exec', '-i', '-w', root, container, 'xargs', '-0', 'rm', '-f'], paths.join('\0'))
  docker(['exec', container, 'find', root, '-mindepth', '2', '-type', 'd', '-empty', '-delete'])
}
