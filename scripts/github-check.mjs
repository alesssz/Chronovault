#!/usr/bin/env node
/**
 * Compares the repository's settings on GitHub with the expected ones, and
 * reports the open alerts and the last workflow runs. Read-only: every call
 * is a GET. Run with `pnpm github:check`.
 *
 * Needs GitHub's command line, `gh`, signed in once with `gh auth login`. It
 * calls the REST API through `gh api`, which adds the signed-in account's
 * token itself; the token is never printed. Some endpoints answer only the
 * repository's owner: another account gets "Not Found", reported as a failure.
 *
 * Exit code 1 when at least one check fails, 0 otherwise (warnings included).
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** The CI jobs main requires before a merge: the job names of ci.yml. */
const REQUIRED_CHECKS = ['Lint, types and unit tests', 'Database and end-to-end tests']

// A terminal opened before GitHub CLI was installed does not see it on the
// PATH yet; on Windows the installer's location is tried first.
const WINDOWS_GH = 'C:\\Program Files\\GitHub CLI\\gh.exe'
const GH = process.platform === 'win32' && existsSync(WINDOWS_GH) ? WINDOWS_GH : 'gh'

let failures = 0

/** Runs gh; its trimmed output, or null when it exits with an error. */
function gh(args) {
  try {
    return execFileSync(GH, args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  }
  catch {
    return null
  }
}

/** One REST API answer as data; null on any error (no access, feature unavailable, offline). */
function api(path) {
  const output = gh(['api', path])
  if (output === null) return null
  // Some endpoints answer "204 No Content" when a feature is on.
  return output === '' ? {} : JSON.parse(output)
}

function ok(message) {
  console.log(`  ✔ ${message}`)
}

function warn(message, fix) {
  console.log(`  ⚠ ${message}${fix ? `\n      → ${fix}` : ''}`)
}

function fail(message, fix) {
  failures++
  console.log(`  ✖ ${message}${fix ? `\n      → ${fix}` : ''}`)
}

function expect(good, message, fix) {
  if (good) ok(message)
  else fail(`not as expected: ${message}`, fix)
}

// --- gh and the repository ---------------------------------------------------
console.log('gh')
if (gh(['--version']) === null) {
  fail('gh is not installed, or not on the PATH', 'install GitHub CLI (https://cli.github.com), then reopen the terminal')
  process.exit(1)
}
if (gh(['auth', 'status']) === null) {
  fail('gh is not signed in', 'gh auth login')
  process.exit(1)
}
const name = gh(['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'])
if (!name) {
  fail('the repository on GitHub could not be read', 'git remote get-url origin; gh auth status')
  process.exit(1)
}
ok(`signed in, repository ${name}`)
const repo = `repos/${name}`

// --- General -----------------------------------------------------------------
console.log('General')
const info = api(repo)
expect(info?.visibility === 'public', 'repository public', 'Settings → General → Danger Zone')
expect(info?.has_wiki === false && info?.has_projects === false && info?.has_discussions === false, 'wiki, projects and discussions off', 'Settings → General → Features')
// The merge script has GitHub merge the pull request once CI passes, as a merge commit.
expect(info?.allow_merge_commit === true && info?.allow_auto_merge === true, 'merge commits and auto-merge allowed', 'Settings → General → Pull Requests: "Allow merge commits" and "Allow auto-merge"')
expect(info?.delete_branch_on_merge === true, 'head branches deleted after merge', 'Settings → General → Pull Requests')

// --- Actions -----------------------------------------------------------------
console.log('Actions')
const permissions = api(`${repo}/actions/permissions`)
expect(permissions?.enabled === true && permissions.allowed_actions === 'selected', 'Actions on, only selected actions allowed', 'Settings → Actions → General → Actions permissions')
const selected = api(`${repo}/actions/permissions/selected-actions`)
expect(selected?.github_owned_allowed === true && selected.verified_allowed === false && selected.patterns_allowed?.length === 0, 'only actions created by GitHub', 'Settings → Actions → General: only "Allow actions created by GitHub" ticked')
const token = api(`${repo}/actions/permissions/workflow`)
expect(token?.default_workflow_permissions === 'read' && token.can_approve_pull_request_reviews === false, 'workflow token read-only, cannot approve pull requests', 'Settings → Actions → General → Workflow permissions')
const forks = api(`${repo}/actions/permissions/fork-pr-contributor-approval`)
expect(forks?.approval_policy === 'all_external_contributors', 'approval required for all external contributors', 'Settings → Actions → General → Approval for running fork pull request workflows')

// --- Code security -----------------------------------------------------------
console.log('Code security')
const features = info?.security_and_analysis ?? {}
expect(features.secret_scanning?.status === 'enabled', 'secret scanning on', 'Settings → Advanced Security → Secret Protection')
expect(features.secret_scanning_push_protection?.status === 'enabled', 'push protection on', 'Settings → Advanced Security → Push protection')
expect(api(`${repo}/vulnerability-alerts`) !== null, 'Dependabot alerts on', 'Settings → Advanced Security → Dependabot alerts')
expect(features.dependabot_security_updates?.status === 'enabled', 'Dependabot security updates on', 'Settings → Advanced Security → Dependabot security updates')
expect(api(`${repo}/private-vulnerability-reporting`)?.enabled === true, 'private vulnerability reporting on', 'Settings → Advanced Security → Private vulnerability reporting')
const codeql = api(`${repo}/code-scanning/default-setup`)
const languages = codeql?.languages?.length ? ` (${codeql.languages.join(', ')})` : ''
expect(codeql?.state === 'configured', `CodeQL default setup on${languages}`, 'Settings → Advanced Security → CodeQL analysis → Default setup')

// --- Ruleset on the default branch ------------------------------------------
console.log('Ruleset')
const summaries = api(`${repo}/rulesets`) ?? []
const rulesets = summaries.map(summary => api(`${repo}/rulesets/${summary.id}`)).filter(Boolean)
const onMain = rulesets.find(ruleset => ruleset.enforcement === 'active' && ruleset.conditions?.ref_name?.include?.includes('~DEFAULT_BRANCH'))
const rules = onMain?.rules ?? []
const types = rules.map(rule => rule.type)
expect(types.includes('deletion') && types.includes('non_fast_forward'), 'main: deletion and force pushes blocked', 'Settings → Rules → Rulesets → main')
expect(types.includes('pull_request'), 'main: changes only through a pull request', 'Settings → Rules → Rulesets → main → Require a pull request before merging')
const required = rules.find(rule => rule.type === 'required_status_checks')?.parameters?.required_status_checks?.map(check => check.context) ?? []
const missing = REQUIRED_CHECKS.filter(check => !required.includes(check))
expect(missing.length === 0, `main: CI must pass (${REQUIRED_CHECKS.join(', ')})`, `Settings → Rules → Rulesets → main → Require status checks to pass, add: ${missing.join(', ')}`)
if (onMain && onMain.bypass_actors.length > 0) {
  warn('the ruleset of main has bypass actors: someone may skip it', 'Settings → Rules → Rulesets → main → Bypass list')
}

// --- Open alerts -------------------------------------------------------------
console.log('Alerts')
/** Number of open alerts at an API path; null when the list cannot be read. */
function openAlerts(path) {
  const list = api(`${path}?state=open&per_page=100`)
  return Array.isArray(list) ? list.length : null
}
const secrets = openAlerts(`${repo}/secret-scanning/alerts`)
if (secrets === null) warn('secret scanning alerts could not be read')
else if (secrets === 0) ok('no open secret scanning alert')
else fail(`${secrets} open secret scanning alert(s): a secret is in the repository`, 'revoke or rotate it first, then remove it from the code')
const code = openAlerts(`${repo}/code-scanning/alerts`)
if (code === null) warn('CodeQL alerts could not be read (none exist before its first analysis)')
else if (code === 0) ok('no open CodeQL alert')
else warn(`${code} open CodeQL alert(s)`, 'Security → Code scanning')
const dependabot = openAlerts(`${repo}/dependabot/alerts`)
if (dependabot === null) warn('Dependabot alerts could not be read')
else if (dependabot === 0) ok('no open Dependabot alert')
else warn(`${dependabot} open Dependabot alert(s)`, 'Security → Dependabot')

// --- Last runs on main -------------------------------------------------------
console.log('Last runs on main')
for (const workflow of ['ci.yml', 'audit.yml']) {
  const output = gh(['run', 'list', '--workflow', workflow, '--branch', 'main', '--status', 'completed', '--limit', '1', '--json', 'conclusion,createdAt,url'])
  const run = output ? JSON.parse(output)[0] : undefined
  if (!run) warn(`${workflow}: no finished run on main yet`)
  else if (run.conclusion === 'success') ok(`${workflow}: success (${run.createdAt.slice(0, 10)})`)
  else fail(`${workflow}: ${run.conclusion} (${run.createdAt.slice(0, 10)})`, run.url)
}

console.log(failures ? `\n✖ ${failures} problem(s) to fix.` : '\n✔ All as decided.')
process.exitCode = failures ? 1 : 0
