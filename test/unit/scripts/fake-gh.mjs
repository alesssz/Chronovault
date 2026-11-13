/**
 * A stand-in for gh, GitHub's command line, for the tests of `pnpm merge:main`
 * (merge-main.test.ts). It answers only the calls the script makes, against the
 * test's bare repository playing GitHub, and keeps its state in a JSON file
 * (FAKE_GH_STATE) the test writes before and reads after the run:
 *
 *   authOk           false: `gh auth status` fails (gh signed out)
 *   autoAllowed      false: the repository does not allow auto-merge
 *   required         true: main's ruleset requires the checks (BLOCKED until they pass)
 *   deleteBranch     true: the repository deletes a branch when its pull request is merged
 *   accountEmail     the account's commit email for web operations, which a merge without
 *                    --author-email (auto-merge) carries: the noreply one, emails kept private
 *   checks           CI over time: one entry ('pending' | 'pass' | 'fail') used up by each
 *                    `gh pr view`, the last one kept; auto-merge merges at the first 'pass'
 *   prs              the pull requests (an open one can be put here before the run)
 *   calls            every call's arguments, in order, for the test to read
 *
 * A merge is a real one: a merge commit (--no-ff) made in a clone of the bare
 * repository with the subject, body and author email asked for, pushed to main.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Where the state lives, and the state itself.
const statePath = process.env.FAKE_GH_STATE
const state = JSON.parse(readFileSync(statePath, 'utf8'))
// This call's arguments (after "node fake-gh.mjs").
const args = process.argv.slice(2)
state.calls.push(args)

/** Saves the state, prints `output` and exits with `code` (stderr for a failure, as gh does). */
function finish(code, output = '') {
  writeFileSync(statePath, JSON.stringify(state, null, 2))
  if (output) (code === 0 ? process.stdout : process.stderr).write(`${output}\n`)
  process.exit(code)
}

/** The value after `--flag` in this call, or undefined. */
function flag(name) {
  // Where the flag sits, if anywhere.
  const at = args.indexOf(name)
  return at === -1 ? undefined : args[at + 1]
}

/** Runs git in `cwd` and returns its trimmed output. */
function git(cwd, ...gitArgs) {
  return execFileSync('git', gitArgs, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

/** The commit a branch points to on "GitHub" (empty once deleted). */
function headOf(branch) {
  try {
    return git(state.remote, 'rev-parse', `refs/heads/${branch}`)
  }
  catch {
    return ''
  }
}

/** The pull request numbered as in this call (`gh pr view 1`, `gh pr merge 1`). */
function prByNumber() {
  return state.prs.find(pr => String(pr.number) === args[2])
}

/** Where CI stands now: the next entry of `checks`, the last one kept once they run out. */
function nextCheck() {
  // The entry for this look, then the cursor moved on.
  const check = state.checks[Math.min(state.checkIndex ?? 0, state.checks.length - 1)]
  state.checkIndex = (state.checkIndex ?? 0) + 1
  return check
}

/** GitHub's merge state for an open pull request, given where CI stands. */
function mergeState(check) {
  if (!state.required) return 'CLEAN'
  return check === 'pass' ? 'CLEAN' : 'BLOCKED'
}

/** Merges the pull request as GitHub would: a merge commit on main, with the message and author asked for. */
function merge(pr, how) {
  // A fresh clone of "GitHub", to merge in.
  const clone = join(state.scratch, `merge-${pr.number}-${state.calls.length}`)
  git(state.scratch, 'clone', '--quiet', state.remote, clone)
  git(clone, 'switch', '--quiet', 'main')
  git(clone, '-c', 'user.name=GitHub', '-c', `user.email=${how.authorEmail ?? state.accountEmail}`, '-c', 'commit.gpgsign=false',
    'merge', '--no-ff', '-m', how.subject, ...(how.body ? ['-m', how.body] : []), `origin/${pr.headRefName}`)
  git(clone, 'push', '--quiet', 'origin', 'main')
  pr.state = 'MERGED'
  pr.autoMergeRequest = null
  if (state.deleteBranch) git(clone, 'push', '--quiet', 'origin', '--delete', pr.headRefName)
}

/** The merge options of this `gh pr merge` call. */
function mergeOptions() {
  return { subject: flag('--subject'), body: flag('--body'), authorEmail: flag('--author-email'), matchHead: flag('--match-head-commit') }
}

// --- The calls ---------------------------------------------------------------------------
// The command asked for: `pr view` is group "pr", command "view".
const [group, command] = args

if (group === 'auth' && command === 'status') {
  finish(state.authOk === false ? 1 : 0, state.authOk === false ? 'You are not logged into any GitHub hosts.' : '')
}

if (group === 'pr' && command === 'list') {
  // The branch's pull requests, newest first, with the fields the script reads.
  const found = state.prs
    .filter(pr => pr.headRefName === flag('--head'))
    .reverse()
    .map(({ number, state: prState, url, headRefOid }) => ({ number, state: prState, url, headRefOid }))
  finish(0, JSON.stringify(found))
}

if (group === 'pr' && command === 'create') {
  // The new pull request, numbered after the others.
  const number = state.prs.length + 1
  // The pull request as GitHub records it: open, on the branch's current commit, no auto-merge.
  const pr = {
    number,
    state: 'OPEN',
    url: `https://github.com/owner/repo/pull/${number}`,
    headRefName: flag('--head'),
    headRefOid: headOf(flag('--head')),
    title: flag('--title'),
    body: flag('--body'),
    autoMergeRequest: null,
  }
  state.prs.push(pr)
  finish(0, pr.url)
}

if (group === 'pr' && command === 'view') {
  // The pull request looked at.
  const pr = prByNumber()
  if (pr.state === 'OPEN') {
    // The branch as "GitHub" has it now, and CI at this moment.
    pr.headRefOid = headOf(pr.headRefName)
    const check = nextCheck()
    // Auto-merge on and CI green: GitHub merges by itself.
    if (pr.autoMergeRequest && check === 'pass') merge(pr, pr.autoMergeRequest)
    pr.statusCheckRollup = [{
      __typename: 'CheckRun',
      name: 'CI',
      status: check === 'pending' ? 'IN_PROGRESS' : 'COMPLETED',
      conclusion: check === 'pass' ? 'SUCCESS' : check === 'fail' ? 'FAILURE' : null,
    }]
    pr.mergeStateStatus = pr.state === 'OPEN' ? mergeState(check) : 'UNKNOWN'
  }
  finish(0, JSON.stringify(pr))
}

if (group === 'pr' && command === 'merge') {
  // The pull request to merge, or whose auto-merge changes.
  const pr = prByNumber()
  if (args.includes('--disable-auto')) {
    pr.autoMergeRequest = null
    finish(0)
  }
  // The merge commit asked for: message, author, and the head commit it must be.
  const how = mergeOptions()
  if (how.matchHead !== headOf(pr.headRefName)) finish(1, 'Head branch was modified. Review and try the merge again.')
  if (args.includes('--auto')) {
    if (state.autoAllowed === false) finish(1, 'GraphQL: Auto merge is not allowed for this repository (enablePullRequestAutoMerge)')
    // As GitHub answers: an author email must be verified on the account, which a noreply address never is.
    if (how.authorEmail) finish(1, 'GraphQL: test does not have a verified email, which is required to enable auto-merging. (enablePullRequestAutoMerge)')
    if (pr.mergeStateStatus === 'CLEAN') finish(1, 'GraphQL: Pull request is in clean status (enablePullRequestAutoMerge)')
    pr.autoMergeRequest = how
    finish(0)
  }
  if (pr.mergeStateStatus !== 'CLEAN') finish(1, 'Pull request is not mergeable: the base branch policy prohibits the merge.')
  merge(pr, how)
  finish(0)
}

finish(1, `fake gh: unexpected call: gh ${args.join(' ')}`)
