#!/usr/bin/env node
/**
 * Prints the project's main addresses: the local app, Studio and Mailpit; the site and the
 * dashboards of Supabase, Cloudflare R2, Vercel and GitHub. Read-only, needs nothing running.
 *
 * Usage:  pnpm urls [site]      (make urls passes the deployed site)
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { githubWebUrl, parseSupabasePorts, projectUrls } from './lib/project-urls.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** A file's trimmed text, or null when it is not there. */
function read(path) {
  const file = join(ROOT, path)
  return existsSync(file) ? readFileSync(file, 'utf8').trim() : null
}

/** The origin's address, or null outside a git checkout or without one. */
function gitRemote() {
  try {
    return execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  }
  catch {
    return null
  }
}

const { local, online } = projectUrls({
  site: process.argv[2] || null,
  ports: parseSupabasePorts(read('supabase/config.toml') ?? ''),
  // Written by `supabase link` (make db-link), git-ignored.
  supabaseRef: read('supabase/.temp/project-ref'),
  github: githubWebUrl(gitRemote()),
})

const width = Math.max(...[...local, ...online].map(link => link.label.length))
for (const [title, links] of [['Local', local], ['Online', online]]) {
  console.log(`\n${title}`)
  for (const link of links) console.log(`  ${link.label.padEnd(width)}  ${link.url ?? `→ ${link.missing}`}`)
}
console.log('\nThe other local services (API, Postgres, S3): make db-status.')
