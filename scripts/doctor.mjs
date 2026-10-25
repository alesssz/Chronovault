#!/usr/bin/env node
/**
 * Checks that this computer has everything Chronovault needs, and says how
 * to fix what is missing, on macOS, Windows or Linux:
 *
 *   node scripts/doctor.mjs     works before anything is installed (only Node needed)
 *   pnpm doctor · make doctor   the same, once pnpm (or make) is there
 *
 * Required (✖, exit code 1): a supported Node, pnpm, Docker running,
 * dependencies installed. Recommended (⚠): host.docker.internal for the
 * Docker mode, Playwright's Chromium for e2e tests, GNU Make. Informative
 * (ℹ): the local Supabase stack and the .env file.
 *
 * It only reads: nothing is installed or changed. README → 11.1 has the
 * full checklist for a new computer.
 */
import { lookup } from 'node:dns/promises'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dockerIsRunning, supabaseStatus, tryRun } from './lib/local-stack.mjs'
import {
  fixFor,
  headlessShellFolder,
  parseVersion,
  pinnedPnpmVersion,
  playwrightBrowsersDir,
  satisfiesEngines,
} from './lib/doctor-checks.mjs'

/** The project folder (this script lives in scripts/), whatever the current directory. */
const root = fileURLToPath(new URL('..', import.meta.url))
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const platform = process.platform
/** Display name of the operating system, for the header. */
const osName = { darwin: 'macOS', win32: 'Windows', linux: 'Linux' }[platform] ?? platform

/** Collected results: printed at the end, they decide the exit code. */
const results = []

/** Records one check: `ok` (✔), `warn` (⚠, recommended), `fail` (✖, required) or `info` (ℹ). */
function report(level, label, fix) {
  results.push({ level, label, fix })
}

// --- Node ----------------------------------------------------------------------------
const nodeRange = pkg.engines?.node ?? ''
if (satisfiesEngines(process.versions.node, nodeRange)) {
  report('ok', `Node ${process.versions.node}`)
}
else {
  report('fail', `Node ${process.versions.node} is not supported (needs ${nodeRange}; .nvmrc pins ${readFileSync(join(root, '.nvmrc'), 'utf8').trim()})`, fixFor('node', platform))
}

// --- pnpm ----------------------------------------------------------------------------
const wantedPnpm = pinnedPnpmVersion(pkg.packageManager)
const pnpmVersion = tryRun('pnpm --version', 15_000)?.trim()
if (!pnpmVersion) {
  report('fail', 'pnpm not found', fixFor('pnpm', platform, { version: wantedPnpm }))
}
else if (wantedPnpm && parseVersion(pnpmVersion)[0] !== parseVersion(wantedPnpm)[0]) {
  report('warn', `pnpm ${pnpmVersion} (the project pins ${wantedPnpm})`, fixFor('pnpm', platform, { version: wantedPnpm }))
}
else {
  report('ok', `pnpm ${pnpmVersion}`)
}

// --- Docker --------------------------------------------------------------------------
const dockerCli = tryRun('docker --version', 10_000)
const dockerUp = dockerCli !== null && dockerIsRunning()
if (dockerCli === null) report('fail', 'Docker not found', fixFor('docker-missing', platform))
else if (!dockerUp) report('fail', 'Docker is installed but not running', fixFor('docker-stopped', platform))
else report('ok', 'Docker running')

// --- Dependencies ----------------------------------------------------------------------
// `nuxt prepare` (postinstall) writes .nuxt/: without it the install failed half-way (e.g. Node too old).
if (!existsSync(join(root, 'node_modules'))) report('fail', 'Dependencies not installed', fixFor('install', platform))
else if (!existsSync(join(root, '.nuxt', 'tsconfig.json'))) report('fail', 'Dependencies installed, but `nuxt prepare` did not complete (often: Node too old during pnpm install)', fixFor('install', platform))
else report('ok', 'Dependencies installed')

// --- host.docker.internal (Docker mode only) -------------------------------------------
try {
  const { address } = await lookup('host.docker.internal')
  report('ok', `host.docker.internal → ${address} (needed by make docker)`)
}
catch {
  report('warn', 'host.docker.internal does not resolve on this computer (sign-in fails in make docker; make local is fine)', fixFor('hosts', platform))
}

// --- Playwright's Chromium (e2e tests only) ----------------------------------------------
try {
  // pnpm keeps playwright-core out of the top level: reach it through @playwright/test.
  const fromProject = createRequire(join(root, 'package.json'))
  const fromPlaywright = createRequire(fromProject.resolve('@playwright/test/package.json'))
  const fromPlaywrightLib = createRequire(fromPlaywright.resolve('playwright/package.json'))
  const browsersJson = JSON.parse(readFileSync(join(dirname(fromPlaywrightLib.resolve('playwright-core/package.json')), 'browsers.json'), 'utf8'))
  const folder = headlessShellFolder(browsersJson)
  const dir = playwrightBrowsersDir(platform, process.env, homedir())
  if (!folder || !dir) report('info', 'Playwright browsers: location unknown (PLAYWRIGHT_BROWSERS_PATH)')
  else if (existsSync(join(dir, folder))) report('ok', 'Playwright Chromium installed (e2e tests)')
  else report('warn', 'Playwright Chromium missing (e2e tests)', fixFor('playwright', platform))
}
catch {
  // No node_modules yet: already reported above.
  report('info', 'Playwright: checked after pnpm install')
}

// --- GNU Make (optional) -----------------------------------------------------------------
if (tryRun('make --version', 10_000)) report('ok', 'GNU Make')
else report('warn', 'GNU Make not found (optional)', fixFor('make', platform))

// --- Local stack (informative) -----------------------------------------------------------
// The status comes from the Supabase CLI, run through pnpm: only meaningful once both are there.
if (dockerUp && pnpmVersion && existsSync(join(root, 'node_modules'))) {
  if (supabaseStatus()) report('ok', 'Local Supabase running')
  else report('info', 'Local Supabase not running', fixFor('supabase', platform))
}
report(existsSync(join(root, '.env')) ? 'ok' : 'info', existsSync(join(root, '.env')) ? '.env present' : '.env not created yet (pnpm local writes it)')

// --- Report ---------------------------------------------------------------------------------
const icons = { ok: '✔', warn: '⚠', fail: '✖', info: 'ℹ' }
console.log(`Chronovault doctor · ${osName} (${process.arch})\n`)
for (const { level, label, fix } of results) {
  console.log(`${icons[level]} ${label}`)
  if (fix && level !== 'ok') console.log(`    → ${fix}`)
}
const failures = results.filter(r => r.level === 'fail').length
const warnings = results.filter(r => r.level === 'warn').length
console.log(failures
  ? `\n✖ ${failures} required item(s) missing: fix them, then run this again.`
  : `\n✔ Ready${warnings ? ` (${warnings} optional item(s) to look at)` : ''}. Start with: pnpm local`)
process.exitCode = failures ? 1 : 0
