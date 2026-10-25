#!/usr/bin/env node
/**
 * One command to run the whole stack. Docker Desktop must already be running.
 *
 *   pnpm local    Supabase + .env + Nuxt dev server (http://localhost:3000)
 *   pnpm docker   Supabase + the app built and run in a container (http://localhost:8080)
 *   pnpm stop     stops the app container and Supabase (data is kept)
 *
 * The same commands are available as `make local`, `make docker`, `make stop`.
 */
import { resolve } from 'node:path'
import {
  dockerIsRunning,
  ensureDocker,
  ensureSupabase,
  localAudioStorageEnv,
  publishableKey,
  runInherited,
  waitForUrl,
  writeEnvFile,
} from './lib/local-stack.mjs'

/** Where the app container answers (compose.yaml maps 8080 → 3000). */
const DOCKER_APP_URL = 'http://localhost:8080'

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
 * `pnpm local`: Docker check → Supabase up → .env written → `pnpm dev` in
 * the foreground (Ctrl+C stops Nuxt only; Supabase keeps running).
 */
async function local() {
  await ensureDocker()
  const status = await ensureSupabase()
  writeEnvFile(resolve('.env'), {
    SUPABASE_URL: status.API_URL,
    SUPABASE_KEY: publishableKey(status),
    ...localAudioStorageEnv(status),
  })
  console.log('✔ .env updated')
  console.log('▸ Starting Nuxt on http://localhost:3000  (Ctrl+C stops the app; `pnpm stop` stops Supabase too)\n')
  return runInherited('pnpm dev')
}

/**
 * `pnpm docker`: Docker check → Supabase up → .env.docker written → image
 * built and container started in the background → wait for /api/health.
 */
async function docker() {
  await ensureDocker()
  const status = await ensureSupabase()

  writeEnvFile(resolve('.env.docker'), {
    NUXT_PUBLIC_SUPABASE_URL: dockerSupabaseUrl(status.API_URL),
    NUXT_PUBLIC_SUPABASE_KEY: publishableKey(status),
    // Presigned audio URLs embed this host: it must work from the container and the browser.
    ...localAudioStorageEnv(status, 'host.docker.internal'),
  })
  console.log('✔ .env.docker updated')

  console.log('▸ Building and starting the app container (the first build takes a few minutes)…')
  const code = await runInherited('docker compose up --build --detach')
  if (code !== 0) return code

  if (!(await waitForUrl(`${DOCKER_APP_URL}/api/health`, 120_000))) {
    console.error('✖ The app container did not become healthy. Check: docker compose logs app')
    return 1
  }
  console.log(`\n✔ Chronovault is running in Docker: ${DOCKER_APP_URL}`)
  console.log('  Demo user: demo@chronoplayer.local / chronoplayer')
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
