#!/usr/bin/env node
/**
 * One command to run the whole stack. Docker Desktop must already be running.
 *
 * The app is two pieces (docs/05-architecture.md, 5.3):
 *   1. Supabase, in Docker: database, sign-in, storage (covers, and the audio
 *      through its S3 endpoint). Containers managed by the Supabase CLI.
 *   2. Nuxt: the pages AND the API (server/api) in one process. There is no
 *      separate API server: the "backend" code runs inside Nuxt.
 *
 *   pnpm local    piece 1 in Docker, piece 2 on this computer with hot reload
 *                 (the way to develop, http://localhost:3100)
 *   pnpm docker   piece 1 in Docker, piece 2 built for production in a container
 *                 (to try the build, http://localhost:8180; no hot reload)
 *   pnpm stop     stops the app container and Supabase (data is kept)
 *
 * The same commands are available as `make local`, `make docker`, `make stop`.
 */
import { resolve } from 'node:path'
import {
  appContainerRunning,
  dockerIsRunning,
  ensureDocker,
  ensureSupabase,
  localAudioStorageEnv,
  publishableKey,
  runInherited,
  waitForUrl,
  writeEnvFile,
} from './lib/local-stack.mjs'

/** Where the app container answers (compose.yaml maps 8180 → 3000). */
const DOCKER_APP_URL = 'http://localhost:8180'

/**
 * Inside the app container 127.0.0.1 is the container itself: Supabase is
 * reached through host.docker.internal, a name Docker Desktop also maps on
 * the host, so the browser and the server use the very same URL.
 */
function dockerSupabaseUrl(apiUrl) {
  // Same port and scheme, only the host changes.
  const url = new URL(apiUrl)
  url.hostname = 'host.docker.internal'
  return url.origin
}

/**
 * `pnpm local`: Docker check → piece 1, Supabase up → .env written → piece 2,
 * `pnpm dev` in the foreground (Ctrl+C stops Nuxt only; Supabase keeps running).
 * Each step says which piece it starts and where it runs.
 */
async function local() {
  await ensureDocker()
  console.log('Chronovault for development, in two pieces:')
  console.log('  1. Supabase   in Docker         database, sign-in, covers and audio')
  console.log('  2. Nuxt       on this computer  the pages and the API (server/api), one process, hot reload\n')

  console.log('▸ 1/2 Supabase (Docker)')
  // The running stack's URLs and keys (started when needed).
  const status = await ensureSupabase()
  writeEnvFile(resolve('.env'), {
    SUPABASE_URL: status.API_URL,
    SUPABASE_KEY: publishableKey(status),
    ...localAudioStorageEnv(status),
  })
  console.log('✔ .env updated')
  // The container of `pnpm docker` still up: its old build on :8180 is not this code.
  if (appContainerRunning()) {
    console.log(`⚠ The app container of \`pnpm docker\` is also running (${DOCKER_APP_URL}): it serves the build of its`)
    console.log('  last `pnpm docker`, not the code you are editing. Use :3100; stop it with `make docker-stop`.')
  }

  console.log('\n▸ 2/2 Nuxt, pages + API (this terminal)')
  console.log('  App      http://localhost:3100   (hot reload: pages, components and server/api)')
  if (status.STUDIO_URL) console.log(`  Studio   ${status.STUDIO_URL}   (the database)`)
  console.log('  Ctrl+C stops Nuxt only; `pnpm stop` stops Supabase too (data is kept)\n')
  return runInherited('pnpm dev')
}

/**
 * `pnpm docker`: Docker check → Supabase up → .env.docker written → image
 * built and container started in the background → wait for /api/health.
 */
async function docker() {
  await ensureDocker()
  // The running stack's URLs and keys (started when needed).
  const status = await ensureSupabase()

  writeEnvFile(resolve('.env.docker'), {
    NUXT_PUBLIC_SUPABASE_URL: dockerSupabaseUrl(status.API_URL),
    NUXT_PUBLIC_SUPABASE_KEY: publishableKey(status),
    // Presigned audio URLs embed this host: it must work from the container and the browser.
    ...localAudioStorageEnv(status, 'host.docker.internal'),
  })
  console.log('✔ .env.docker updated')

  console.log('▸ Building and starting the app container (the first build takes a few minutes)…')
  // Its exit code (0: built and started).
  const code = await runInherited('docker compose up --build --detach')
  if (code !== 0) return code

  if (!(await waitForUrl(`${DOCKER_APP_URL}/api/health`, 120_000))) {
    console.error('✖ The app container did not become healthy. Check: docker compose logs app')
    return 1
  }
  console.log(`\n✔ Chronovault is running in Docker: ${DOCKER_APP_URL}`)
  console.log('  The production build of the code as it is now: rebuild with `pnpm docker` after a change')
  console.log('  (to develop with hot reload: `pnpm local`, http://localhost:3100).')
  console.log('  Demo user: demo@chronovault.local / chronovault')
  console.log('  Logs: docker compose logs -f app · Stop everything: pnpm stop')
  return 0
}

/** `pnpm stop`: removes the app container and stops Supabase (its Docker volumes, i.e. the data, are kept). */
async function stop() {
  if (!dockerIsRunning()) {
    console.log('Docker is not running: nothing to stop.')
    return 0
  }
  console.log('▸ Stopping the app container…')
  await runInherited('docker compose down')
  console.log('▸ Stopping Supabase (data is kept)…')
  return runInherited('pnpm exec supabase stop')
}

// Dispatch on the first argument (`node scripts/stack.mjs local`).
const commands = { local, docker, stop }
const command = commands[process.argv[2]]

if (!command) {
  console.error('Usage: node scripts/stack.mjs <local|docker|stop>')
  process.exit(1)
}

try {
  process.exitCode = await command()
}
catch (error) {
  console.error(`✖ ${error.message}`)
  process.exitCode = 1
}
