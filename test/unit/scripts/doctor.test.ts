/**
 * Pure helpers of `pnpm doctor` (scripts/doctor.mjs): Node version ranges, the pinned pnpm
 * version, where Playwright keeps its browsers on each OS, and the fixes it suggests.
 */
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  fixFor,
  headlessShellFolder,
  parseVersion,
  pinnedPnpmVersion,
  playwrightBrowsersDir,
  satisfiesEngines,
} from '../../../scripts/lib/doctor-checks.mjs'

/** The range of package.json → engines.node. */
const RANGE = '^22.21.0 || ^24.11.0 || >=26.0.0'

describe('parseVersion', () => {
  it('reads plain and v-prefixed versions, missing parts as 0', () => {
    expect(parseVersion('v24.22.1')).toEqual([24, 22, 1])
    expect(parseVersion('24')).toEqual([24, 0, 0])
  })
})

describe('satisfiesEngines', () => {
  it.each([
    ['22.9.0', false], // Homebrew's Node on the machine that inspired this check
    ['22.21.0', true],
    ['23.5.0', false],
    ['24.10.0', false],
    ['24.11.0', true],
    ['24.22.1', true],
    ['25.1.0', false],
    ['26.0.0', true],
    ['30.2.0', true],
  ])('%s → %s', (version, expected) => {
    expect(satisfiesEngines(version, RANGE)).toBe(expected)
  })
})

describe('pinnedPnpmVersion', () => {
  it('reads the version from packageManager', () => {
    expect(pinnedPnpmVersion('pnpm@12.14.0')).toBe('12.14.0')
    expect(pinnedPnpmVersion('pnpm@12.14.0+sha512.abc')).toBe('12.14.0')
  })

  it('gives null for other package managers or nothing', () => {
    expect(pinnedPnpmVersion('yarn@4.0.0')).toBeNull()
    expect(pinnedPnpmVersion(undefined)).toBeNull()
  })
})

describe('playwrightBrowsersDir', () => {
  const home = '/home/me'

  it('uses each OS default', () => {
    expect(playwrightBrowsersDir('darwin', {}, home)).toBe(join(home, 'Library', 'Caches', 'ms-playwright'))
    expect(playwrightBrowsersDir('win32', { LOCALAPPDATA: 'C:/Users/me/AppData/Local' }, home)).toBe(join('C:/Users/me/AppData/Local', 'ms-playwright'))
    expect(playwrightBrowsersDir('linux', {}, home)).toBe(join(home, '.cache', 'ms-playwright'))
  })

  it('follows PLAYWRIGHT_BROWSERS_PATH, and gives up when browsers live in node_modules', () => {
    expect(playwrightBrowsersDir('darwin', { PLAYWRIGHT_BROWSERS_PATH: '/opt/pw' }, home)).toBe('/opt/pw')
    expect(playwrightBrowsersDir('darwin', { PLAYWRIGHT_BROWSERS_PATH: '0' }, home)).toBeNull()
  })
})

describe('headlessShellFolder', () => {
  it('names the folder after the headless shell revision', () => {
    expect(headlessShellFolder({ browsers: [{ name: 'chromium', revision: '1248' }, { name: 'chromium-headless-shell', revision: '1248' }] }))
      .toBe('chromium_headless_shell-1248')
  })

  it('gives null when the manifest has no headless shell', () => {
    expect(headlessShellFolder({ browsers: [] })).toBeNull()
  })
})

describe('fixFor', () => {
  it('suggests the right tools on macOS and Windows', () => {
    expect(fixFor('node', 'darwin')).toContain('brew install nvm')
    expect(fixFor('node', 'win32')).toContain('winget install CoreyButler.NVMforWindows')
    expect(fixFor('hosts', 'darwin')).toContain('/etc/hosts')
    expect(fixFor('hosts', 'win32')).toContain('drivers\\etc\\hosts')
  })

  it('pins the project pnpm version', () => {
    expect(fixFor('pnpm', 'win32', { version: '12.14.0' })).toContain('npm i -g pnpm@12.14.0 --allow-scripts=pnpm')
  })
})
