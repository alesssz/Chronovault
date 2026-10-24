/**
 * `vite.optimizeDeps.include` in nuxt.config.ts against the packages the browser code really
 * imports. The dev server pre-bundles the listed packages at startup; a package the browser
 * imports but the list forgets is discovered on the first visit to a page that imports it, and
 * Vite then reloads that page (whatever was being done on it is lost). The list is kept by hand,
 * so this test reads every import of app/ and shared/ (the code that runs in the browser) and
 * fails, naming the package, when one is missing, and also when the list names a package nothing
 * imports any more. Development only: production builds are not affected either way.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it, vi } from 'vitest'

/** The project's root folder (this file is in test/unit/config/). */
const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
/** The folders whose code runs in the browser (server/ never does). */
const BROWSER_SOURCES = ['app', 'shared']

/**
 * Packages the browser imports that are left out of pre-bundling on purpose by someone else, so
 * they never trigger a reload and must not be listed:
 * - `vue`: Nuxt excludes it (with vue-router, nuxt/app and its other own packages) in its client
 *   environment (`@nuxt/vite-builder`, `clientEnvironment`), to keep a single copy of Vue;
 * - `pinia`: `@pinia/nuxt` adds it to `optimizeDeps.exclude`.
 */
const EXCLUDED_ELSEWHERE = new Set(['vue', 'pinia'])

afterAll(() => {
  vi.unstubAllGlobals()
})

/** Every .ts and .vue file under `folder`, as paths relative to the root (with `/` on every system, for the messages). */
function sourceFiles(folder: string): string[] {
  return readdirSync(join(ROOT, folder), { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile() && /\.(?:ts|vue)$/.test(entry.name))
    .map(entry => relative(ROOT, join(entry.parentPath, entry.name)).split(sep).join('/'))
}

/**
 * The npm packages a file imports at runtime: `import … from 'x'`, `import 'x'`,
 * `export … from 'x'` and `import('x')`, as written (deep paths included: Vite needs the exact
 * specifier in the list). Left out: relative and aliased paths (`./`, `~/`, `~~/`, `#…`),
 * virtual modules, asset imports with a query (`?url`: never pre-bundled), and type-only
 * imports, which TypeScript removes.
 */
function runtimeImports(source: string): string[] {
  // Specifiers found, before filtering.
  const found: string[] = []
  // Static imports and re-exports; the clause may span lines (`import {\n a,\n b\n} from 'x'`).
  for (const [, typeOnly, clause, specifier] of source.matchAll(/(?:^|[\n;])\s*(?:import|export)\s+(type\s+)?([^'";]*?)\s*from\s*['"]([^'"]+)['"]/g)) {
    // `import type …`, or `import { type A, type B }`: erased by TypeScript.
    const names = clause!.match(/^\{([\s\S]*)\}$/)?.[1]?.split(',').map(n => n.trim()).filter(Boolean)
    if (typeOnly || (names && names.every(n => n.startsWith('type ')))) continue
    found.push(specifier!)
  }
  // Side-effect imports (`import 'x'`) and dynamic ones (`import('x')`).
  for (const [, specifier] of source.matchAll(/(?:^|[\n;])\s*import\s*['"]([^'"]+)['"]/g)) found.push(specifier!)
  for (const [, specifier] of source.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) found.push(specifier!)
  return found.filter(s => !/^(?:\.|\/|~|#|virtual:)/.test(s) && !s.includes('?'))
}

/** The list in nuxt.config.ts, read from the config itself (`defineNuxtConfig` is a global there). */
async function optimizeDepsInclude(): Promise<string[]> {
  vi.stubGlobal('defineNuxtConfig', (config: unknown) => config)
  const { default: config } = await import('~~/nuxt.config') as { default: { vite?: { optimizeDeps?: { include?: string[] } } } }
  return config.vite?.optimizeDeps?.include ?? []
}

/** Each package the browser code imports, with the files that import it. */
function browserImports(): Map<string, string[]> {
  // Package → importing files, filled below.
  const imports = new Map<string, string[]>()
  for (const file of BROWSER_SOURCES.flatMap(sourceFiles)) {
    for (const specifier of runtimeImports(readFileSync(join(ROOT, file), 'utf8'))) {
      imports.set(specifier, [...(imports.get(specifier) ?? []), file])
    }
  }
  return imports
}

describe('vite.optimizeDeps.include', () => {
  it('lists every package the browser imports (otherwise the dev server reloads the page that first imports it)', async () => {
    const include = new Set(await optimizeDepsInclude())
    const missing = [...browserImports()]
      .filter(([specifier]) => !include.has(specifier) && !EXCLUDED_ELSEWHERE.has(specifier))
      .map(([specifier, files]) => `'${specifier}' (imported by ${files.join(', ')})`)
    // An empty list, or the packages to add to optimizeDeps.include in nuxt.config.ts.
    expect(missing).toEqual([])
  })

  it('lists nothing the browser no longer imports', async () => {
    const imported = browserImports()
    const stale = (await optimizeDepsInclude()).filter(specifier => !imported.has(specifier))
    // An empty list, or the entries to remove from optimizeDeps.include in nuxt.config.ts.
    expect(stale).toEqual([])
  })
})

describe('runtimeImports', () => {
  it('finds static, multi-line, side-effect and dynamic imports, as written', () => {
    const source = [
      `import WaveSurfer from 'wavesurfer.js'`,
      `import {\n  a,\n  b,\n} from 'pkg-a'`,
      `import 'pkg-side-effect'`,
      `const lib = await import('pkg-dynamic/dist/x.js')`,
      `export { c } from 'pkg-reexport'`,
    ].join('\n')
    expect(runtimeImports(source)).toEqual(['wavesurfer.js', 'pkg-a', 'pkg-reexport', 'pkg-side-effect', 'pkg-dynamic/dist/x.js'])
  })

  it('leaves out type-only imports, local and aliased paths, and asset queries', () => {
    const source = [
      `import type { A } from 'types-only'`,
      `import { type B, type C } from 'types-inline'`,
      `import { type D, e } from 'mixed'`,
      `import x from './local'`,
      `import y from '~/lib/y'`,
      `import z from '~~/shared/z'`,
      `import w from '#imports'`,
      `import wasm from 'pkg/file.wasm?url'`,
    ].join('\n')
    expect(runtimeImports(source)).toEqual(['mixed'])
  })
})
