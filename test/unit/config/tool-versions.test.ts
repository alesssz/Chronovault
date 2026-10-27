/**
 * The tool versions written in more than one place agree. The Dockerfile installs pnpm and picks
 * its Node image by hand, apart from the versions the rest of the project follows (packageManager
 * in package.json, which CI's pnpm setup and pnpm itself on every computer read; .nvmrc, which
 * CI and nvm read): moving one and forgetting the other would build the image with another pnpm
 * or Node than the one everything was tested with.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/** The project's root folder (this file is in test/unit/config/). */
const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
/** A file of the project, as text. */
const read = (path: string) => readFileSync(`${ROOT}${path}`, 'utf8')

describe('tool versions', () => {
  it('the Docker image installs the pnpm of packageManager', () => {
    // "pnpm@12.14.0" in package.json, and the version the Dockerfile installs.
    const packageManager = (JSON.parse(read('package.json')) as { packageManager: string }).packageManager
    const installed = read('Dockerfile').match(/npm install --global (pnpm@[\w.-]+)/)?.[1]
    expect(installed).toBe(packageManager)
  })

  it('the Docker image runs the Node major of .nvmrc', () => {
    // "24" in .nvmrc, and the Dockerfile's default NODE_VERSION.
    const nvmrc = read('.nvmrc').trim()
    const image = read('Dockerfile').match(/^ARG NODE_VERSION=(\S+)$/m)?.[1]
    expect(image).toBe(nvmrc)
  })
})
