/**
 * The project's main addresses, for `pnpm urls` / `make urls`: built from what the repository
 * already knows (the local ports in supabase/config.toml, the git remote, the project
 * `supabase link` recorded), so the list cannot drift from the setup it describes.
 */

/** The ports `supabase start` uses when config.toml says nothing. */
const DEFAULT_PORTS = { studio: 54323, mail: 54324 }

/** The config.toml section holding each port (`[local_smtp]` is Mailpit, `[inbucket]` in older CLIs). */
const PORT_SECTIONS = { studio: ['studio'], mail: ['local_smtp', 'inbucket'] }

/**
 * Studio's and Mailpit's ports from supabase/config.toml's text: the `port` line of each one's
 * own section.
 * @param {string} toml
 * @returns {{ studio: number, mail: number }}
 */
export function parseSupabasePorts(toml) {
  const ports = { ...DEFAULT_PORTS }
  let section = ''
  for (const line of toml.split('\n')) {
    const header = /^\s*\[([^\]]+)\]/.exec(line)
    if (header) {
      section = header[1].trim()
      continue
    }
    const port = /^\s*port\s*=\s*(\d+)/.exec(line)
    if (!port) continue
    for (const [service, sections] of Object.entries(PORT_SECTIONS)) {
      if (sections.includes(section)) ports[service] = Number(port[1])
    }
  }
  return ports
}

/**
 * The repository's page on GitHub from its git remote (HTTPS, with or without credentials, or
 * SSH), or null for a remote elsewhere. Credentials in the remote never reach the result.
 * @param {string | null | undefined} remote
 * @returns {string | null}
 */
export function githubWebUrl(remote) {
  const match = /github\.com[/:]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(remote?.trim() ?? '')
  return match ? `https://github.com/${match[1]}/${match[2]}` : null
}

/** @typedef {{ label: string, url: string | null, missing?: string }} Link */

/**
 * The main addresses, one per service. What is not known (no site, not linked, no GitHub remote)
 * has no URL but says how to get it.
 * @param {{ site?: string | null, ports: { studio: number, mail: number }, supabaseRef?: string | null, github?: string | null }} input
 * @returns {{ local: Link[], online: Link[] }}
 */
export function projectUrls({ site, ports, supabaseRef, github }) {
  return {
    local: [
      { label: 'App', url: 'http://localhost:3100' },
      { label: 'Supabase Studio', url: `http://127.0.0.1:${ports.studio}` },
      { label: 'Mailpit (emails)', url: `http://127.0.0.1:${ports.mail}` },
    ],
    online: [
      { label: 'Site', url: site?.replace(/\/$/, '') || null, missing: 'pnpm urls https://<your-domain>' },
      { label: 'Supabase', url: supabaseRef ? `https://supabase.com/dashboard/project/${supabaseRef}` : null, missing: 'make db-link ref=<project-ref>' },
      // `:account` is the signed-in account, filled in by Cloudflare.
      { label: 'Cloudflare R2', url: 'https://dash.cloudflare.com/?to=/:account/r2/overview' },
      // The team's slug is not in the repository: the dashboard lists the projects.
      { label: 'Vercel', url: 'https://vercel.com/dashboard' },
      { label: 'GitHub', url: github ?? null, missing: 'no GitHub remote (git remote get-url origin)' },
    ],
  }
}
