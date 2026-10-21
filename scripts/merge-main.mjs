#!/usr/bin/env node
/**
 * Merges the current branch into main, then cleans up.
 *
 *   pnpm merge:main          asks for confirmation before merging
 *   pnpm merge:main --yes    no confirmation (e.g. scripts)
 *   make merge
 *
 * What it does, in order:
 *   1. On main: prints "Already on main" and stops (nothing to do).
 *   2. Stops when the branch is not ready: uncommitted changes, never pushed,
 *      local commits not pushed yet, remote commits not pulled yet, nothing
 *      new compared to main, or a local main with unpushed commits.
 *   3. Shows the commits and the merge message, and asks for confirmation.
 *   4. Updates main from GitHub, merges with a merge commit (--no-ff) whose
 *      message lists every commit of the branch, and pushes main.
 *   5. Deletes the branch on GitHub and locally.
 *   6. Leaves you on main, in sync with GitHub.
 *
 * Nothing is left half-done: a merge conflict is aborted and you are taken
 * back to your branch; if pushing main fails, the branch is kept.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { createInterface } from 'node:readline/promises'
import { buildMergeMessage } from './lib/merge-message.mjs'

const MAIN = 'main'
const REMOTE = 'origin'
const assumeYes = process.argv.includes('--yes') || process.argv.includes('-y')

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

async function confirm(question) {
  if (assumeYes) return true
  if (!process.stdin.isTTY) throw new Stop('No terminal to ask for confirmation: run it again with --yes.')
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const answer = await rl.question(question)
    return /^y(es)?$/i.test(answer.trim())
  }
  finally {
    rl.close()
  }
}

async function run() {
  const branch = git('branch', '--show-current')
  if (!branch) throw new Stop('You are not on a branch (detached HEAD): switch to the branch to merge.')
  if (branch === MAIN) {
    console.log(`✔ Already on ${MAIN}: nothing to merge.`)
    return 0
  }

  // --- Is the branch ready? -----------------------------------------------------------
  if (git('status', '--porcelain')) {
    throw new Stop('You have uncommitted changes: commit (and push) or stash them first.')
  }

  console.log(`▸ Fetching ${REMOTE}…`)
  if (!gitVisible('fetch', '--prune', REMOTE)) throw new Stop(`Could not reach ${REMOTE}: check your connection.`)

  const upstream = `${REMOTE}/${branch}`
  if (!gitSucceeds('rev-parse', '--verify', '--quiet', `refs/remotes/${upstream}`)) {
    throw new Stop(`"${branch}" has never been pushed. Push it first: git push -u ${REMOTE} ${branch}`)
  }
  const unpushed = countCommits(`${upstream}..${branch}`)
  if (unpushed > 0) {
    throw new Stop(`"${branch}" has ${unpushed} local commit(s) not pushed yet. Push them first: git push`)
  }
  const unpulled = countCommits(`${branch}..${upstream}`)
  if (unpulled > 0) {
    throw new Stop(`${REMOTE} has ${unpulled} commit(s) on "${branch}" that you don't have. Pull them first: git pull`)
  }
  if (countCommits(`${REMOTE}/${MAIN}..${MAIN}`) > 0) {
    throw new Stop(`Your local ${MAIN} has commits that are not on ${REMOTE}: push or remove them before merging.`)
  }

  const subjects = git('log', '--reverse', '--no-merges', '--format=%s', `${REMOTE}/${MAIN}..${branch}`)
    .split('\n')
    .filter(Boolean)
  if (subjects.length === 0) throw new Stop(`"${branch}" has no commits that ${MAIN} doesn't already have: nothing to merge.`)

  // --- Confirmation --------------------------------------------------------------------
  const message = buildMergeMessage(branch, subjects)
  console.log(`\n"${branch}" → ${MAIN}: ${subjects.length} commit(s)\n`)
  console.log(message.replace(/^/gm, '    '))
  console.log('')
  if (!(await confirm(`Merge "${branch}" into ${MAIN}, push it and delete the branch? [y/N] `))) {
    console.log('Nothing done.')
    return 0
  }

  // --- Merge ---------------------------------------------------------------------------
  console.log(`\n▸ Updating ${MAIN}…`)
  if (!gitVisible('switch', MAIN) || !gitVisible('pull', '--ff-only', REMOTE, MAIN)) {
    gitVisible('switch', branch)
    throw new Stop(`Could not update ${MAIN}. You are back on "${branch}"; nothing was merged.`)
  }

  console.log(`▸ Merging "${branch}"…`)
  if (!gitVisible('merge', '--no-ff', '--no-edit', '-m', message, branch)) {
    // Conflicts (or any failure): undo the attempt completely.
    gitSucceeds('merge', '--abort')
    gitVisible('switch', branch)
    throw new Stop(`The merge has conflicts and was cancelled. You are back on "${branch}": merge ${MAIN} into it, fix the conflicts, push, then run this again.`)
  }

  console.log(`▸ Pushing ${MAIN}…`)
  if (!gitVisible('push', REMOTE, MAIN)) {
    throw new Stop(`The merge is done locally but ${MAIN} could not be pushed. Run "git push" on ${MAIN}; "${branch}" was kept.`)
  }

  // --- Clean-up ------------------------------------------------------------------------
  console.log(`▸ Deleting "${branch}" on ${REMOTE} and locally…`)
  if (!gitVisible('push', REMOTE, '--delete', branch)) console.warn(`⚠ Could not delete "${branch}" on ${REMOTE}: delete it from GitHub.`)
  if (!gitVisible('branch', '-d', branch)) console.warn(`⚠ Could not delete the local "${branch}": git branch -d ${branch}`)

  console.log(`▸ Syncing ${MAIN}…`)
  gitVisible('pull', '--ff-only', REMOTE, MAIN)
  gitVisible('fetch', '--prune', REMOTE)

  console.log(`\n✔ "${branch}" merged into ${MAIN} and deleted. You are on ${MAIN}, in sync with ${REMOTE}.`)
  return 0
}

try {
  process.exitCode = await run()
}
catch (error) {
  console.error(`✖ ${error instanceof Stop ? error.message : `Unexpected error: ${error.message}`}`)
  process.exitCode = 1
}
