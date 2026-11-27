/**
 * `pnpm urls` (scripts/lib/project-urls.mjs): the local ports read from config.toml, the GitHub
 * page from the git remote, and how to get what is not known in place of its address.
 */
import { describe, expect, it } from 'vitest'
import { githubWebUrl, parseSupabasePorts, projectUrls } from '../../../scripts/lib/project-urls.mjs'

describe('parseSupabasePorts', () => {
  it('reads Studio\'s and Mailpit\'s ports from their own sections', () => {
    const toml = '[api]\nport = 6001\n[studio]\nport = 6003\n[local_smtp]\nport = 6004\n'
    expect(parseSupabasePorts(toml)).toEqual({ studio: 6003, mail: 6004 })
  })

  it('keeps the defaults for what is missing', () => {
    expect(parseSupabasePorts('[studio]\nport = 7003\n')).toEqual({ studio: 7003, mail: 54324 })
    expect(parseSupabasePorts('')).toEqual({ studio: 54323, mail: 54324 })
  })
})

describe('githubWebUrl', () => {
  it('turns an HTTPS or SSH remote into the repository\'s page', () => {
    expect(githubWebUrl('https://github.com/owner/repo.git\n')).toBe('https://github.com/owner/repo')
    expect(githubWebUrl('git@github.com:owner/repo.git')).toBe('https://github.com/owner/repo')
    expect(githubWebUrl('https://github.com/owner/repo')).toBe('https://github.com/owner/repo')
  })

  it('never carries the credentials a remote may hold', () => {
    expect(githubWebUrl('https://user:secret@github.com/owner/repo.git')).toBe('https://github.com/owner/repo')
  })

  it('gives nothing for a remote elsewhere, or none', () => {
    expect(githubWebUrl('https://gitlab.com/owner/repo.git')).toBeNull()
    expect(githubWebUrl(null)).toBeNull()
  })
})

describe('projectUrls', () => {
  const ports = { studio: 6003, mail: 6004 }

  it('builds the addresses from what it is given', () => {
    const { local, online } = projectUrls({ site: 'https://music.example/', ports, supabaseRef: 'abcd', github: 'https://github.com/owner/repo' })
    expect(local.find(link => link.label === 'Supabase Studio')?.url).toBe('http://127.0.0.1:6003')
    expect(online.find(link => link.label === 'Site')?.url).toBe('https://music.example')
    expect(online.find(link => link.label === 'Supabase')?.url).toBe('https://supabase.com/dashboard/project/abcd')
    expect(online.find(link => link.label === 'GitHub')?.url).toBe('https://github.com/owner/repo')
  })

  it('says how to get what it does not know instead of an address', () => {
    const { online } = projectUrls({ site: null, ports, supabaseRef: null, github: null })
    expect(online.find(link => link.label === 'Site')).toMatchObject({ url: null, missing: expect.stringContaining('pnpm urls https://') })
    expect(online.find(link => link.label === 'Supabase')).toMatchObject({ url: null, missing: expect.stringContaining('make db-link') })
    expect(online.find(link => link.label === 'GitHub')?.url).toBeNull()
  })
})
