#!/usr/bin/env node
/**
 * Merges the current branch into main through a GitHub pull request, once CI
 * passes, then cleans up.
 *
 *   pnpm merge:main               asks for confirmation first
 *   pnpm merge:main --yes         no confirmation (e.g. scripts)
 *   pnpm merge:main --no-checks   skips `pnpm check` (e.g. a docs-only branch; CI still runs)
 *   make merge
 *
 * Why a pull request: main deploys to production as soon as it changes, and
 * the database and end-to-end tests run only on GitHub. Merged from this
 * computer, a branch reached production without waiting for them (it did,
 * with CI red for days). GitHub merges only once CI is green, and main's
 * ruleset refuses any other way in (docs/13-deployment.md, 13.8).
 *
 * What it does, in order:
 *   1. On main: prints "Already on main" and stops (nothing to do).
 *   2. Stops when gh (GitHub's command line) is missing or signed out, or the
 *      repository's commit email is not the GitHub noreply one: the merge commit
 *      carries it, and the repository is public.
 *   3. Stops when the branch is not ready: uncommitted changes, never pushed,
 *      local commits not pushed yet, remote commits not pulled yet, nothing
 *      new compared to main, a local main with unpushed commits, or conflicts
 *      with main (found without touching your files).
 *   4. Runs `pnpm check` (lint, typecheck, tests with the coverage floors): the
 *      quick checks, minutes before CI would say the same.
 *   5. Shows the commits and the merge message, and asks for confirmation.
 *   6. Opens the pull request (or reuses the one already open for the branch).
 *   7. Waits for CI, printing where it stands. Once main's ruleset requires the
 *      checks, it turns on GitHub's auto-merge: from then on GitHub merges by
 *      itself when CI passes, even if this terminal is closed (Ctrl+C only stops
 *      the waiting). Otherwise it merges from here once every check passed.
 *      Either way the merge commit gets the usual message (--no-ff, every commit
 *      of the branch listed), a noreply author, and only the commit checked here
 *      can be merged.
 *   8. A failed check turns auto-merge off again and stops: nothing is merged.
 *      Fix, push, run it again; the same pull request is reused.
 *   9. Once merged: switches to main, pulls it, deletes the branch on GitHub and
 *      locally. Run again on a branch whose pull request was merged meanwhile
 *      (after Ctrl+C), it does only this clean-up.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { createInterface } from 'node:readline/promises'
import { setTimeout as sleep } from 'node:timers/promises'
import { buildMergeMessage } from './lib/merge-message.mjs'
import { buildPullRequest, describeChecks, summarizeChecks } from './lib/pull-request.mjs'

/** The branch everything is merged into (production deploys from it). */
const MAIN = 'main'
/** The GitHub remote. */
const REMOTE = 'origin'
/** `--yes` (or `-y`): answer yes to the confirmation question. */
const assumeYes = process.argv.includes('--yes') || process.argv.includes('-y')
/** `--no-checks`: skip the local checks (CI still runs them before the merge). */
const skipChecks = process.argv.includes('--no-checks')
/** The checks run before opening the pull request; the tests replace them (their throwaway repositories hold no project). */
const CHECK_COMMAND = process.env.MERGE_MAIN_CHECK_COMMAND || 'pnpm check'
/**
 * The gh command, as program and leading arguments. The tests put a stand-in
 * for GitHub here (a JSON array such as ["node", "fake-gh.mjs"]).
 */
const GH = process.env.MERGE_MAIN_GH ? JSON.parse(process.env.MERGE_MAIN_GH) : ['gh']
/** Time between two looks at the pull request while waiting (CI takes about ten minutes). */
const POLL_MS = Number(process.env.MERGE_MAIN_POLL_MS) || 15_000
/** Looks in a row GitHub may fail to answer before the script gives up waiting (about two minutes). */
const MAX_GH_FAILURES = 8
/** Merge states in which GitHub would merge right now (HAS_HOOKS: allowed, with hooks to run). */
const MERGEABLE_NOW = new Set(['CLEAN', 'UNSTABLE', 'HAS_HOOKS'])

/** An expected stop: the message is printed and the command exits with code 1. */
class Stop extends Error {}

/** Runs git and returns its trimmed output; throws on failure. */
function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

/** Runs git with its output shown to the user; returns true on success. */
function gitVisible(...args) {
  return spawnSync('git', args, { stdio: 'inherit' }).status === 0
}

/** True when the git command succeeds (its output is discarded). */
function gitSucceeds(...args) {
  try {
    git(...args)
    return true
  }
  catch {
    return false
  }
}

/** Number of commits in a range such as `origin/x..x`. */
function countCommits(range) {
  return Number(git('rev-list', '--count', range))
}

/** Runs gh and returns its trimmed output; throws on failure (the error carries gh's own message). */
function gh(...args) {
  return execFileSync(GH[0], [...GH.slice(1), ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

/** Runs gh and parses its JSON output. */
function ghJson(...args) {
  return JSON.parse(gh(...args))
}

/** What a failed command said (gh and git write the reason to stderr). */
function reason(error) {
  return (error.stderr?.toString().trim() || error.message).split('\n')[0]
}

/** Asks a yes/no question in the terminal (`--yes` answers yes; no terminal = stop). */
async function confirm(question) {
  if (assumeYes) return true
  if (!process.stdin.isTTY) throw new Stop('No terminal to ask for confirmation: run it again with --yes.')
  // A prompt on this terminal.
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    // What the user typed.
    const answer = await rl.question(question)
    return /^y(es)?$/i.test(answer.trim())
  }
  finally {
    rl.close()
  }
}

/**
 * The branch's latest pull request into main, whatever its state: an open one
 * first, else the most recently merged or closed. Null when there is none.
 */
function findPullRequest(branch) {
  // Every pull request from this branch into main, newest first.
  const found = ghJson('pr', 'list', '--head', branch, '--base', MAIN, '--state', 'all', '--json', 'number,state,url,headRefOid', '--limit', '10')
  return found.find(pr => pr.state === 'OPEN') ?? found[0] ?? null
}

/** The pull request as it stands now: state, merge state, checks, auto-merge, head commit. */
function viewPullRequest(number) {
  return ghJson('pr', 'view', String(number), '--json', 'state,mergeStateStatus,statusCheckRollup,autoMergeRequest,headRefOid,url')
}

/**
 * After the merge on GitHub: main pulled, the branch deleted on GitHub (unless
 * GitHub already did it) and locally, you left on main.
 */
function cleanUp(branch) {
  console.log(`▸ Updating ${MAIN}…`)
  if (!gitVisible('switch', MAIN) || !gitVisible('pull', '--ff-only', REMOTE, MAIN)) {
    throw new Stop(`The branch is merged on GitHub, but ${MAIN} could not be updated here: run "git switch ${MAIN} && git pull", then delete "${branch}".`)
  }
  // Still on GitHub? (The repository's "Automatically delete head branches" removes it at the merge.)
  if (gitSucceeds('ls-remote', '--exit-code', '--heads', REMOTE, branch)) {
    console.log(`▸ Deleting "${branch}" on ${REMOTE}…`)
    if (!gitVisible('push', REMOTE, '--delete', branch)) console.warn(`⚠ Could not delete "${branch}" on ${REMOTE}: delete it from GitHub.`)
  }
  console.log(`▸ Deleting the local "${branch}"…`)
  if (!gitVisible('branch', '-d', branch)) console.warn(`⚠ Could not delete the local "${branch}": git branch -d ${branch}`)
  gitVisible('fetch', '--prune', REMOTE)
  console.log(`\n✔ "${branch}" merged into ${MAIN} and deleted. You are on ${MAIN}, in sync with ${REMOTE}.`)
}

/**
 * Waits for CI on the pull request and gets it merged: by GitHub's auto-merge
 * when main's ruleset requires the checks, or from here once every check passed.
 * Returns once GitHub reports the pull request merged; throws Stop otherwise.
 *
 * The merge commit's author: a merge from here names `authorEmail` (the clone's
 * noreply address) explicitly. A request for auto-merge cannot: GitHub accepts
 * there only an email verified on the account, which the noreply address never
 * is ("<user> does not have a verified email"), and the request fails. Without
 * it GitHub uses the account's commit email for web operations, the noreply one
 * when the account keeps its emails private (docs/13-deployment.md, 13.8).
 */
async function waitAndMerge(pr, sha, mergeFlags, authorEmail) {
  // gh calls in a row that failed (a dropped connection), auto-merge already asked for, the last line printed.
  let failures = 0
  let autoTried = false
  let lastLine = ''
  console.log(`▸ Waiting for CI (${pr.url}/checks). Ctrl+C stops waiting; with auto-merge on, GitHub still merges.`)

  for (;;) {
    // The pull request now; a failed look is retried, a few times in a row at most.
    let now
    try {
      now = viewPullRequest(pr.number)
      failures = 0
    }
    catch (error) {
      failures += 1
      if (failures >= MAX_GH_FAILURES) {
        throw new Stop(`GitHub stopped answering (${reason(error)}). The pull request is ${pr.url}: run this again later to finish.`)
      }
      console.warn(`⚠ GitHub did not answer (${failures}/${MAX_GH_FAILURES}), trying again…`)
      await sleep(POLL_MS)
      continue
    }

    if (now.state === 'MERGED') return
    if (now.state === 'CLOSED') throw new Stop(`The pull request was closed on GitHub without merging: ${pr.url}`)
    // Someone pushed to the branch meanwhile: what was checked here is no longer what would be merged.
    if (now.headRefOid !== sha) throw new Stop(`The branch changed on GitHub while waiting. Pull, check, then run this again.`)

    // Where the checks stand, printed when it changed.
    const checks = summarizeChecks(now.statusCheckRollup)
    const line = describeChecks(checks)
    if (line !== lastLine) console.log(`  CI: ${line}`)
    lastLine = line

    if (checks.failed.length) {
      // Nothing may merge on its own after a later push: a merge is always asked for here.
      if (now.autoMergeRequest) gh('pr', 'merge', String(pr.number), '--disable-auto')
      throw new Stop(`CI failed (${checks.failed.join(', ')}): nothing was merged. See ${pr.url}/checks, fix, push, then run this again.`)
    }
    if (now.mergeStateStatus === 'DIRTY') {
      throw new Stop(`The pull request has conflicts with ${MAIN}: merge ${MAIN} into your branch, fix them, push, then run this again.`)
    }
    if (now.mergeStateStatus === 'BEHIND') {
      throw new Stop(`${MAIN} moved on and must be merged into the branch first: merge ${MAIN} into it, push, then run this again.`)
    }

    // Every check reported and passed, and GitHub would merge now: merge from here.
    const allPassed = checks.pending.length === 0 && checks.passed.length > 0
    if (allPassed && MERGEABLE_NOW.has(now.mergeStateStatus)) {
      console.log(`▸ CI passed. Merging…`)
      try {
        gh('pr', 'merge', String(pr.number), ...mergeFlags, '--author-email', authorEmail)
      }
      catch (error) {
        throw new Stop(`GitHub refused the merge: ${reason(error)}. The pull request is ${pr.url}.`)
      }
    }
    // Blocked by the ruleset until CI passes: let GitHub merge as soon as it does
    // (no --author-email here: see above).
    else if (now.mergeStateStatus === 'BLOCKED' && !now.autoMergeRequest && !autoTried) {
      autoTried = true
      try {
        gh('pr', 'merge', String(pr.number), '--auto', ...mergeFlags)
        console.log(`▸ Auto-merge on: GitHub merges by itself once CI passes.`)
      }
      catch (error) {
        // Most often the repository does not allow auto-merge: the merge then happens from here.
        console.warn(`⚠ Auto-merge could not be turned on (${reason(error)}): keep this terminal open, the merge happens from here.`)
      }
    }
    await sleep(POLL_MS)
  }
}

/** The whole procedure; resolves with the exit code, throws Stop for expected refusals. */
async function run() {
  // The branch checked out (empty when HEAD is detached).
  const branch = git('branch', '--show-current')
  if (!branch) throw new Stop('You are not on a branch (detached HEAD): switch to the branch to merge.')
  if (branch === MAIN) {
    console.log(`✔ Already on ${MAIN}: nothing to merge.`)
    return 0
  }

  // --- Tools and identity ---------------------------------------------------------------
  try {
    gh('auth', 'status')
  }
  catch {
    throw new Stop('gh, GitHub\'s command line, is missing or not signed in: install it (brew install gh, or winget install GitHub.cli), then run "gh auth login" with your personal account, answering No to "Authenticate Git with your GitHub credentials?" (docs/00-setup.md).')
  }
  // The email the merge commit will carry: the clone's own identity (docs/00-setup.md, 0.3).
  const email = gitSucceeds('config', 'user.email') ? git('config', 'user.email') : ''
  if (!email.endsWith('@users.noreply.github.com')) {
    throw new Stop(`This clone's commit email (${email || 'none'}) is not your GitHub noreply address, and the merge commit would carry it into a public repository. Set it first: git config user.email "<id>+<user>@users.noreply.github.com"`)
  }

  // --- Is the branch ready? -----------------------------------------------------------
  if (git('status', '--porcelain')) {
    throw new Stop('You have uncommitted changes: commit (and push) or stash them first.')
  }

  console.log(`▸ Fetching ${REMOTE}…`)
  if (!gitVisible('fetch', '--prune', REMOTE)) throw new Stop(`Could not reach ${REMOTE}: check your connection.`)

  // The branch as GitHub has it (after the fetch above).
  const upstream = `${REMOTE}/${branch}`
  if (!gitSucceeds('rev-parse', '--verify', '--quiet', `refs/remotes/${upstream}`)) {
    // Gone from GitHub: deleted after its pull request was merged, while this script waited elsewhere or not at all.
    // The branch's latest pull request, merged if that is what happened.
    const merged = findPullRequest(branch)
    if (merged?.state === 'MERGED' && merged.headRefOid === git('rev-parse', branch)) {
      console.log(`✔ "${branch}" was already merged (${merged.url}). Cleaning up.`)
      cleanUp(branch)
      return 0
    }
    throw new Stop(`"${branch}" has never been pushed. Push it first: git push -u ${REMOTE} ${branch}`)
  }
  // Local commits the remote does not have yet.
  const unpushed = countCommits(`${upstream}..${branch}`)
  if (unpushed > 0) {
    throw new Stop(`"${branch}" has ${unpushed} local commit(s) not pushed yet. Push them first: git push`)
  }
  // Remote commits this checkout does not have yet.
  const unpulled = countCommits(`${branch}..${upstream}`)
  if (unpulled > 0) {
    throw new Stop(`${REMOTE} has ${unpulled} commit(s) on "${branch}" that you don't have. Pull them first: git pull`)
  }
  if (countCommits(`${REMOTE}/${MAIN}..${MAIN}`) > 0) {
    throw new Stop(`Your local ${MAIN} has commits that are not on ${REMOTE}: push or remove them before merging.`)
  }

  // The commit that will be merged, and the branch's latest pull request.
  const sha = git('rev-parse', branch)
  let pr = findPullRequest(branch)
  // Merged on GitHub already (auto-merge finished after Ctrl+C): only the clean-up is left.
  if (pr?.state === 'MERGED' && pr.headRefOid === sha) {
    console.log(`✔ "${branch}" was already merged (${pr.url}). Cleaning up.`)
    cleanUp(branch)
    return 0
  }

  // The subjects of the branch's own commits, oldest first, for the messages.
  const subjects = git('log', '--reverse', '--no-merges', '--format=%s', `${REMOTE}/${MAIN}..${branch}`)
    .split('\n')
    .filter(Boolean)
  if (subjects.length === 0) throw new Stop(`"${branch}" has no commits that ${MAIN} doesn't already have: nothing to merge.`)

  // Conflicts with main, found by a merge computed in git's object store alone (git 2.38+):
  // exit 0 clean, 1 conflicts, anything else (an older git) leaves it to GitHub.
  const trial = spawnSync('git', ['merge-tree', '--write-tree', `${REMOTE}/${MAIN}`, branch], { stdio: 'ignore' })
  if (trial.status === 1) {
    throw new Stop(`"${branch}" has conflicts with ${MAIN}: merge ${MAIN} into it, fix the conflicts, push, then run this again.`)
  }

  // --- Checks --------------------------------------------------------------------------
  // On the branch as pushed (the working tree is clean): the quick ones, before waiting for CI.
  if (skipChecks) {
    console.log(`▸ Checks skipped (--no-checks); CI still runs them.`)
  }
  else {
    console.log(`▸ Running the checks (${CHECK_COMMAND})…`)
    // Through a shell: on Windows `pnpm` is `pnpm.cmd`, which only a shell finds; the output is shown live.
    if (spawnSync(CHECK_COMMAND, { shell: true, stdio: 'inherit' }).status !== 0) {
      throw new Stop(`The checks failed: fix them, push, then run this again (or skip them with --no-checks). Nothing was opened or merged.`)
    }
    console.log(`✔ Checks passed.`)
  }

  // --- Confirmation --------------------------------------------------------------------
  // The merge commit's message, shown now and given to GitHub for the merge.
  const message = buildMergeMessage(branch, subjects)
  console.log(`\n"${branch}" → ${MAIN}: ${subjects.length} commit(s)\n`)
  console.log(message.replace(/^/gm, '    '))
  console.log('')
  if (!(await confirm(`Open a pull request, merge it into ${MAIN} once CI passes, and delete the branch? [y/N] `))) {
    console.log('Nothing done.')
    return 0
  }

  // --- Pull request --------------------------------------------------------------------
  if (pr?.state === 'OPEN') {
    console.log(`▸ Pull request already open: ${pr.url}`)
  }
  else {
    console.log(`▸ Opening the pull request…`)
    // What GitHub shows on the pull request's page.
    const { title, body } = buildPullRequest(branch, subjects)
    try {
      gh('pr', 'create', '--base', MAIN, '--head', branch, '--title', title, '--body', body)
    }
    catch (error) {
      throw new Stop(`GitHub refused the pull request: ${reason(error)}`)
    }
    pr = findPullRequest(branch)
    console.log(`  ${pr.url}`)
  }

  // How GitHub merges it, now or by auto-merge: a merge commit (--no-ff) with the usual message,
  // and only if the branch is still the commit checked here. The author's email is added for a
  // merge from here only (see waitAndMerge).
  // The message's first line (the commit's subject) and the lines after it (its body).
  const [subject, ...rest] = message.split('\n')
  // gh pr merge's options, the same for a merge from here and for auto-merge.
  const mergeFlags = [
    '--merge',
    '--subject', subject,
    '--body', rest.join('\n').trim(),
    '--match-head-commit', sha,
  ]
  await waitAndMerge(pr, sha, mergeFlags, email)

  // --- Clean-up ------------------------------------------------------------------------
  cleanUp(branch)
  return 0
}

try {
  process.exitCode = await run()
}
catch (error) {
  console.error(`✖ ${error instanceof Stop ? error.message : `Unexpected error: ${error.message}`}`)
  process.exitCode = 1
}
