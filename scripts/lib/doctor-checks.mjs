/**
 * Pure helpers of `pnpm doctor` (scripts/doctor.mjs): version checks, where
 * Playwright keeps its browsers, and the fix to suggest on each operating
 * system. No side effects here, so they are unit-tested
 * (test/unit/scripts/doctor.test.ts).
 *
 * Plain JavaScript that runs on old Node versions too: the doctor must work
 * on a machine whose Node is exactly what is wrong.
 */
import { join } from 'node:path'

/** `"24.11.0"` or `"v24.11.0"` → `[24, 11, 0]` (missing parts count as 0). */
export function parseVersion(version) {
  // Major, minor and patch, each a number (0 when missing or not a number).
  const [major = 0, minor = 0, patch = 0] = String(version).trim().replace(/^v/, '').split('.').map(part => Number.parseInt(part, 10) || 0)
  return [major, minor, patch]
}

/** -1, 0 or 1, like a sort comparator. */
function compareVersions(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1
  }
  return 0
}

/**
 * Whether `version` satisfies an `engines` range made of `^x.y.z` and
 * `>=x.y.z` alternatives joined by `||` (the only forms package.json uses),
 * e.g. `^22.21.0 || ^24.11.0 || >=26.0.0`.
 */
export function satisfiesEngines(version, range) {
  // The installed version, as numbers.
  const current = parseVersion(version)
  return range.split('||').some((alternative) => {
    // One alternative of the range, e.g. `^24.11.0`.
    const part = alternative.trim()
    if (part.startsWith('>=')) return compareVersions(current, parseVersion(part.slice(2))) >= 0
    if (part.startsWith('^')) {
      // The lowest version the caret allows.
      const minimum = parseVersion(part.slice(1))
      // Caret: same major version, at least the given one.
      return current[0] === minimum[0] && compareVersions(current, minimum) >= 0
    }
    return false
  })
}

/** The pnpm version pinned in `packageManager` (`"pnpm@12.14.0"` → `"12.14.0"`), or null. */
export function pinnedPnpmVersion(packageManager) {
  // The version after `pnpm@` (any hash after it is ignored).
  const match = /^pnpm@(\d+\.\d+\.\d+)/.exec(packageManager ?? '')
  return match ? match[1] : null
}

/**
 * Folder where Playwright downloads its browsers, or null when it cannot be
 * known (`PLAYWRIGHT_BROWSERS_PATH=0` keeps them inside node_modules).
 * Defaults: macOS ~/Library/Caches/ms-playwright, Windows
 * %LOCALAPPDATA%\ms-playwright, Linux ~/.cache/ms-playwright.
 */
export function playwrightBrowsersDir(platform, env, home) {
  // A folder chosen with PLAYWRIGHT_BROWSERS_PATH (`0`: inside node_modules).
  const custom = env.PLAYWRIGHT_BROWSERS_PATH
  if (custom === '0') return null
  if (custom) return custom
  if (platform === 'darwin') return join(home, 'Library', 'Caches', 'ms-playwright')
  if (platform === 'win32') return join(env.LOCALAPPDATA ?? join(home, 'AppData', 'Local'), 'ms-playwright')
  return join(env.XDG_CACHE_HOME ?? join(home, '.cache'), 'ms-playwright')
}

/**
 * Folder name of the headless Chromium the e2e tests launch, from
 * playwright-core's browsers.json (e.g. `chromium_headless_shell-1248`).
 */
export function headlessShellFolder(browsersJson) {
  // The headless shell's entry, with its revision.
  const entry = browsersJson.browsers?.find(browser => browser.name === 'chromium-headless-shell')
  return entry ? `chromium_headless_shell-${entry.revision}` : null
}

/**
 * What to do about each problem, per operating system (`darwin`, `win32`,
 * anything else = Linux). The texts are commands to copy.
 */
export function fixFor(problem, platform, details = {}) {
  // Which system the fix is written for.
  const mac = platform === 'darwin'
  const windows = platform === 'win32'
  switch (problem) {
    case 'node':
      if (mac) return 'Install Node 24 with nvm: brew install nvm (then the 2 lines for ~/.zshrc, see README 11.1), nvm install, nvm use'
      if (windows) return 'Install Node 24 with nvm-windows: winget install CoreyButler.NVMforWindows, then in a new terminal: nvm install 24 && nvm use 24'
      return 'Install Node 24 with nvm (https://github.com/nvm-sh/nvm): nvm install && nvm use'
    case 'pnpm':
      return `npm i -g pnpm@${details.version ?? '12'} --allow-scripts=pnpm   (with nvm: once per Node version)`
    case 'docker-missing':
      if (mac) return 'Install Docker Desktop (https://www.docker.com/products/docker-desktop/), then open it'
      if (windows) return 'Install Docker Desktop with the WSL 2 backend: winget install Docker.DockerDesktop, restart, then open it'
      return 'Install Docker Engine (https://docs.docker.com/engine/install/) and start it'
    case 'docker-stopped':
      return windows || mac
        ? 'Open Docker Desktop and wait until the engine is running'
        : 'Start Docker: sudo systemctl start docker'
    case 'install':
      return 'pnpm install   (with a supported Node active: nvm use)'
    case 'hosts':
      if (mac) return 'Only for make docker: echo "127.0.0.1 host.docker.internal" | sudo tee -a /etc/hosts'
      if (windows) return 'Only for pnpm docker: Docker Desktop → Settings → General → "Add the *.docker.internal names to the host\'s /etc/hosts file", or add "127.0.0.1 host.docker.internal" to C:\\Windows\\System32\\drivers\\etc\\hosts (Notepad as administrator)'
      return 'Only for pnpm docker: echo "127.0.0.1 host.docker.internal" | sudo tee -a /etc/hosts'
    case 'playwright':
      return 'Only for e2e tests: pnpm exec playwright install chromium   (make test-e2e does it for you)'
    case 'make':
      return windows
        ? 'Optional: winget install ezwinports.make (from Git Bash), or use the pnpm commands (pnpm local, pnpm docker, pnpm doctor…)'
        : 'Optional: xcode-select --install (macOS) or your package manager; every make target has a pnpm equivalent'
    case 'supabase':
      return 'pnpm local (or pnpm db:start) starts it; the first time it downloads a few GB of Docker images'
    default:
      return ''
  }
}
