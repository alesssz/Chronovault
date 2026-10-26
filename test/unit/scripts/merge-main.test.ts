/**
 * `pnpm merge:main` (scripts/merge-main.mjs), run for real against throwaway
 * git repositories: a bare repository plays GitHub, a clone plays the
 * developer's working copy. Also the merge message builder.
 *
 * The checks the script runs before merging (`pnpm check`) are replaced,
 * through MERGE_MAIN_CHECK_COMMAND, by a command that exits with a chosen
 * code: these repositories hold no project to check.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildMergeMessage } from '../../../scripts/lib/merge-message.mjs'

// The script under test.
const SCRIPT = fileURLToPath(new URL('../../../scripts/merge-main.mjs', import.meta.url))

describe('buildMergeMessage', () => {
  it('uses the subject of a single commit as the title', () => {
    expect(buildMergeMessage('feat/queue', ['Add an editable play queue']))
      .toBe('Merge feat/queue: Add an editable play queue')
  })

  it('lists every commit, oldest first, grouping repeated subjects', () => {
    expect(buildMergeMessage('feat/queue', ['Add the queue', 'Fix typo', 'Add tests', 'Fix typo']))
      .toBe('Merge feat/queue (4 commits)\n\n- Add the queue\n- Fix typo (×2)\n- Add tests')
  })
})

describe('merge-main script', () => {
  /** Temporary folder holding the fake remote and the working copy. */
  let root: string
  /** The working copy the script runs in. */
  let work: string

  /** Runs git in `cwd` and returns its output. */
  function git(cwd: string, ...args: string[]): string {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  }

  /** A commit that writes `content` into `file`. */
  function commit(cwd: string, file: string, content: string, message: string) {
    writeFileSync(join(cwd, file), content)
    git(cwd, 'add', file)
    git(cwd, 'commit', '-m', message)
  }

  /** A committer identity, and no signing (the developer's global config may require it). */
  function configure(cwd: string) {
    git(cwd, 'config', 'user.name', 'Test')
    git(cwd, 'config', 'user.email', 'test@example.com')
    git(cwd, 'config', 'commit.gpgsign', 'false')
  }

  /** A check command that exits with `code` (the real `pnpm check` needs a project, which these repositories are not). */
  const checkExiting = (code: number) => `"${process.execPath}" -e "process.exit(${code})"`

  /** Runs the script in the working copy (stdin is not a terminal), with checks that pass unless told otherwise. */
  function runScript(...args: string[]) {
    return runScriptWithChecks(checkExiting(0), ...args)
  }

  /** Runs the script with `checkCommand` as its checks. */
  function runScriptWithChecks(checkCommand: string, ...args: string[]) {
    // The script run as the user would, its output and exit code collected.
    const result = spawnSync(process.execPath, [SCRIPT, ...args], {
      cwd: work,
      encoding: 'utf8',
      env: { ...process.env, MERGE_MAIN_CHECK_COMMAND: checkCommand },
    })
    return { code: result.status, output: `${result.stdout}${result.stderr}` }
  }

  /** Branch the working copy is on. */
  const currentBranch = () => git(work, 'branch', '--show-current')
  /** Branches that exist on the fake remote. */
  const remoteBranches = () => git(work, 'ls-remote', '--heads', 'origin')

  /** A pushed feature branch with two commits. */
  function pushedBranch(name = 'feat/thing') {
    git(work, 'switch', '-c', name)
    commit(work, 'a.txt', 'a', 'Add a')
    commit(work, 'b.txt', 'b', 'Add b')
    git(work, 'push', '-u', 'origin', name)
  }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'merge-main-'))
    // A bare repository standing in for GitHub, and a clone of it to work in.
    const remote = join(root, 'remote.git')
    work = join(root, 'work')
    git(root, 'init', '--bare', '--initial-branch=main', remote)
    git(root, 'clone', remote, work)
    configure(work)
    git(work, 'switch', '-c', 'main')
    commit(work, 'README.md', 'hello', 'Initial commit')
    git(work, 'push', '-u', 'origin', 'main')
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('does nothing on main', () => {
    // The script run with --yes: exit code and output.
    const { code, output } = runScript('--yes')
    expect(code).toBe(0)
    expect(output).toContain('Already on main')
  })

  it('merges a pushed branch, deletes it everywhere and leaves you on an up-to-date main', () => {
    pushedBranch()

    // The script run with --yes: exit code and output.
    const { code, output } = runScript('--yes')

    expect(code, output).toBe(0)
    expect(currentBranch()).toBe('main')
    // A real merge commit, with the cumulative message.
    expect(git(work, 'log', '-1', '--format=%P', 'main').split(' ')).toHaveLength(2)
    expect(git(work, 'log', '-1', '--format=%B', 'main')).toBe('Merge feat/thing (2 commits)\n\n- Add a\n- Add b')
    // Pushed, and the branch is gone locally and on the remote.
    expect(git(work, 'rev-parse', 'main')).toBe(git(work, 'rev-parse', 'origin/main'))
    expect(git(work, 'branch', '--list', 'feat/thing')).toBe('')
    expect(remoteBranches()).not.toContain('feat/thing')
  }, 30_000)

  it('runs the checks before merging, and merges nothing when they fail', () => {
    pushedBranch()

    // The script run with --yes, its checks failing.
    const { code, output } = runScriptWithChecks(checkExiting(1), '--yes')

    expect(code).toBe(1)
    expect(output).toContain('The checks failed')
    // Nothing merged or deleted: still on the branch, main untouched.
    expect(currentBranch()).toBe('feat/thing')
    expect(git(work, 'log', '-1', '--format=%s', 'origin/main')).toBe('Initial commit')
    expect(remoteBranches()).toContain('feat/thing')
  }, 30_000)

  it('merges without running the checks with --no-checks', () => {
    pushedBranch()

    // Checks that would fail, skipped.
    const { code, output } = runScriptWithChecks(checkExiting(1), '--yes', '--no-checks')

    expect(code, output).toBe(0)
    expect(output).toContain('Checks skipped')
    expect(currentBranch()).toBe('main')
  }, 30_000)

  it('stops on uncommitted changes', () => {
    pushedBranch()
    writeFileSync(join(work, 'a.txt'), 'changed')
    // The script run with --yes: exit code and output.
    const { code, output } = runScript('--yes')
    expect(code).toBe(1)
    expect(output).toContain('uncommitted changes')
  })

  it('stops when the branch has never been pushed', () => {
    git(work, 'switch', '-c', 'feat/local')
    commit(work, 'a.txt', 'a', 'Add a')
    // The script run with --yes: exit code and output.
    const { code, output } = runScript('--yes')
    expect(code).toBe(1)
    expect(output).toContain('never been pushed')
  })

  it('stops when some commits are only local', () => {
    pushedBranch()
    commit(work, 'c.txt', 'c', 'Add c')
    // The script run with --yes: exit code and output.
    const { code, output } = runScript('--yes')
    expect(code).toBe(1)
    expect(output).toContain('1 local commit(s) not pushed')
    expect(currentBranch()).toBe('feat/thing')
  })

  it('stops when the branch has nothing new', () => {
    git(work, 'switch', '-c', 'feat/empty')
    git(work, 'push', '-u', 'origin', 'feat/empty')
    // The script run with --yes: exit code and output.
    const { code, output } = runScript('--yes')
    expect(code).toBe(1)
    expect(output).toContain('nothing to merge')
  })

  it('asks for confirmation, and stops without a terminal to ask in', () => {
    pushedBranch()
    // The script run without --yes (and no terminal to ask in).
    const { code, output } = runScript()
    expect(code).toBe(1)
    expect(output).toContain('--yes')
    expect(remoteBranches()).toContain('feat/thing')
  })

  it('cancels a conflicting merge and takes you back to your branch', () => {
    pushedBranch()
    // Meanwhile main changed the same file on the remote.
    git(work, 'switch', 'main')
    commit(work, 'a.txt', 'main version', 'Change a on main')
    git(work, 'push', 'origin', 'main')
    git(work, 'switch', 'feat/thing')

    // The script run with --yes: exit code and output.
    const { code, output } = runScript('--yes')

    expect(code).toBe(1)
    expect(output).toContain('conflicts')
    expect(currentBranch()).toBe('feat/thing')
    expect(git(work, 'status', '--porcelain')).toBe('')
    expect(remoteBranches()).toContain('feat/thing')
  }, 30_000)
})
