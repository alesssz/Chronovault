/**
 * `pnpm merge:main` (scripts/merge-main.mjs), run for real against throwaway
 * git repositories: a bare repository plays GitHub, a clone plays the
 * developer's working copy, and fake-gh.mjs stands in for gh on top of the
 * bare repository (pull requests, a CI the test scripts, real merges). Also
 * the pure helpers: the merge message, the pull request's title and the
 * reading of its checks.
 *
 * The checks the script runs before opening the pull request (`pnpm check`)
 * are replaced, through MERGE_MAIN_CHECK_COMMAND, by a command that exits with
 * a chosen code: these repositories hold no project to check.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildMergeMessage } from '../../../scripts/lib/merge-message.mjs'
import { buildPullRequest, describeChecks, summarizeChecks } from '../../../scripts/lib/pull-request.mjs'

// The script under test, and the stand-in for gh it is given.
const SCRIPT = fileURLToPath(new URL('../../../scripts/merge-main.mjs', import.meta.url))
const FAKE_GH = fileURLToPath(new URL('./fake-gh.mjs', import.meta.url))
/** The identity of the working copy: a GitHub noreply address, as the script requires. */
const NOREPLY = '1+test@users.noreply.github.com'

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

describe('buildPullRequest', () => {
  it('titles a single commit with its subject', () => {
    // The pull request of a one-commit branch.
    const pr = buildPullRequest('fix/x', ['Fix the thing'])
    expect(pr.title).toBe('Fix the thing')
    expect(pr.body).toContain('pnpm merge:main')
  })

  it('titles several commits with the branch and lists them', () => {
    // The pull request of a two-commit branch.
    const pr = buildPullRequest('feat/x', ['Add a', 'Add b'])
    expect(pr.title).toBe('feat/x (2 commits)')
    expect(pr.body).toMatch(/^- Add a\n- Add b\n\n/)
  })
})

describe('summarizeChecks and describeChecks', () => {
  it('sorts check runs and commit statuses into passed, running and failed', () => {
    // A rollup mixing every kind of entry.
    const summary = summarizeChecks([
      { __typename: 'CheckRun', name: 'Lint', status: 'COMPLETED', conclusion: 'SUCCESS' },
      { __typename: 'CheckRun', name: 'Skipped job', status: 'COMPLETED', conclusion: 'SKIPPED' },
      { __typename: 'CheckRun', name: 'E2E', status: 'IN_PROGRESS', conclusion: null },
      { __typename: 'CheckRun', name: 'Queued', status: 'QUEUED', conclusion: null },
      { __typename: 'CheckRun', name: 'Cancelled', status: 'COMPLETED', conclusion: 'CANCELLED' },
      { __typename: 'StatusContext', context: 'Vercel', state: 'SUCCESS' },
      { __typename: 'StatusContext', context: 'Pending status', state: 'PENDING' },
      { __typename: 'StatusContext', context: 'Broken status', state: 'ERROR' },
    ])
    expect(summary).toEqual({
      passed: ['Lint', 'Skipped job', 'Vercel'],
      pending: ['E2E', 'Queued', 'Pending status'],
      failed: ['Cancelled', 'Broken status'],
    })
    expect(describeChecks(summary)).toBe('3 of 8 checks passed, 3 running, 2 failed')
  })

  it('says when no check has started yet', () => {
    expect(describeChecks(summarizeChecks([]))).toBe('waiting for the checks to start')
    expect(describeChecks(summarizeChecks(null as never))).toBe('waiting for the checks to start')
  })
})

describe('merge-main script', () => {
  /** Temporary folder holding the fake remote, the working copy and the fake gh's state. */
  let root: string
  /** The working copy the script runs in. */
  let work: string
  /** The bare repository playing GitHub. */
  let remote: string
  /** The fake gh's state file. */
  let ghState: string

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

  /** A noreply committer identity, and no signing (the developer's global config may require it). */
  function configure(cwd: string) {
    git(cwd, 'config', 'user.name', 'Test')
    git(cwd, 'config', 'user.email', NOREPLY)
    git(cwd, 'config', 'commit.gpgsign', 'false')
  }

  /** The fake GitHub's settings and CI for this test (see fake-gh.mjs), over the defaults. */
  function setGitHub(settings: Record<string, unknown>) {
    // The defaults: auto-merge allowed, no ruleset, CI already green, the account's emails kept private.
    const defaults = { remote, scratch: root, authOk: true, autoAllowed: true, required: false, deleteBranch: false, accountEmail: NOREPLY, checks: ['pass'], prs: [], calls: [] }
    writeFileSync(ghState, JSON.stringify({ ...defaults, ...settings }))
  }

  /** The fake GitHub's state after the run: pull requests and every gh call made. */
  function gitHub(): { prs: Array<Record<string, unknown>>, calls: string[][] } {
    return JSON.parse(readFileSync(ghState, 'utf8'))
  }

  /** The gh calls of one kind (`pr create`, `pr merge`…). */
  const callsOf = (group: string, command: string) => gitHub().calls.filter(call => call[0] === group && call[1] === command)

  /** A check command that exits with `code` (the real `pnpm check` needs a project, which these repositories are not). */
  const checkExiting = (code: number) => `"${process.execPath}" -e "process.exit(${code})"`

  /** Runs the script in the working copy (stdin is not a terminal), with checks that pass unless told otherwise. */
  function runScript(...args: string[]) {
    return runScriptWithChecks(checkExiting(0), ...args)
  }

  /** Runs the script with `checkCommand` as its checks, the fake gh and a short wait between looks. */
  function runScriptWithChecks(checkCommand: string, ...args: string[]) {
    // The script run as the user would, its output and exit code collected.
    const result = spawnSync(process.execPath, [SCRIPT, ...args], {
      cwd: work,
      encoding: 'utf8',
      env: {
        ...process.env,
        MERGE_MAIN_CHECK_COMMAND: checkCommand,
        MERGE_MAIN_GH: JSON.stringify([process.execPath, FAKE_GH]),
        MERGE_MAIN_POLL_MS: '5',
        FAKE_GH_STATE: ghState,
      },
    })
    return { code: result.status, output: `${result.stdout}${result.stderr}` }
  }

  /** Branch the working copy is on. */
  const currentBranch = () => git(work, 'branch', '--show-current')
  /** Branches that exist on the fake remote. */
  const remoteBranches = () => git(work, 'ls-remote', '--heads', 'origin')
  /** Subject of main's last commit on the fake remote. */
  const remoteMainSubject = () => git(remote, 'log', '-1', '--format=%s', 'main')

  /** A pushed feature branch with two commits. */
  function pushedBranch(name = 'feat/thing') {
    git(work, 'switch', '-c', name)
    commit(work, 'a.txt', 'a', 'Add a')
    commit(work, 'b.txt', 'b', 'Add b')
    git(work, 'push', '-u', 'origin', name)
  }

  /** Checks that the branch reached main as a merge commit with the usual message and was cleaned up everywhere. */
  function expectMergedAndCleanedUp(name = 'feat/thing') {
    expect(currentBranch()).toBe('main')
    // A real merge commit, with the cumulative message and the noreply author.
    expect(git(work, 'log', '-1', '--format=%P', 'main').split(' ')).toHaveLength(2)
    expect(git(work, 'log', '-1', '--format=%B', 'main')).toBe(`Merge ${name} (2 commits)\n\n- Add a\n- Add b`)
    expect(git(work, 'log', '-1', '--format=%ae', 'main')).toBe(NOREPLY)
    // In sync with the remote, and the branch gone locally and on the remote.
    expect(git(work, 'rev-parse', 'main')).toBe(git(work, 'rev-parse', 'origin/main'))
    expect(git(work, 'branch', '--list', name)).toBe('')
    expect(remoteBranches()).not.toContain(name)
  }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'merge-main-'))
    // A bare repository standing in for GitHub, and a clone of it to work in.
    remote = join(root, 'remote.git')
    work = join(root, 'work')
    ghState = join(root, 'gh-state.json')
    git(root, 'init', '--bare', '--initial-branch=main', remote)
    git(root, 'clone', remote, work)
    configure(work)
    git(work, 'switch', '-c', 'main')
    commit(work, 'README.md', 'hello', 'Initial commit')
    git(work, 'push', '-u', 'origin', 'main')
    setGitHub({})
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

  it('opens a pull request, waits for CI and merges once every check passed', () => {
    pushedBranch()
    // No ruleset yet: GitHub would merge at once, so the script itself waits for green.
    setGitHub({ checks: ['pending', 'pending', 'pass'] })

    // The script run with --yes: exit code and output.
    const { code, output } = runScript('--yes')

    expect(code, output).toBe(0)
    expect(output).toContain('CI: 0 of 1 check passed, 1 running')
    expect(output).toContain('CI: 1 of 1 check passed')
    // One pull request, titled after the branch, merged from here with the commit checked.
    const [pr] = gitHub().prs
    expect(pr).toMatchObject({ title: 'feat/thing (2 commits)', state: 'MERGED' })
    const merges = callsOf('pr', 'merge')
    expect(merges).toHaveLength(1)
    expect(merges[0]).not.toContain('--auto')
    expect(merges[0]).toContain(git(work, 'rev-parse', 'origin/main^2'))
    // From here the author is named explicitly: the clone's noreply address.
    expect(merges[0]).toEqual(expect.arrayContaining(['--author-email', NOREPLY]))
    expectMergedAndCleanedUp()
  }, 30_000)

  it('turns on auto-merge when the ruleset requires the checks, and GitHub merges', () => {
    pushedBranch()
    // The ruleset blocks the merge until CI passes; GitHub then deletes the branch itself.
    setGitHub({ required: true, deleteBranch: true, checks: ['pending', 'pending', 'pass'] })

    // The script run with --yes: exit code and output.
    const { code, output } = runScript('--yes')

    expect(code, output).toBe(0)
    expect(output).toContain('Auto-merge on')
    // Only the auto-merge request: the merge itself was GitHub's.
    const merges = callsOf('pr', 'merge')
    expect(merges).toHaveLength(1)
    expect(merges[0]).toContain('--auto')
    // No author email in the request (GitHub refuses a noreply one there): the account's own is used,
    // the noreply address, as expectMergedAndCleanedUp checks on the merge commit.
    expect(merges[0]).not.toContain('--author-email')
    expect(output).not.toContain('Auto-merge could not be turned on')
    expectMergedAndCleanedUp()
  }, 30_000)

  it('merges from the terminal when the repository does not allow auto-merge', () => {
    pushedBranch()
    setGitHub({ required: true, autoAllowed: false, checks: ['pending', 'pass'] })

    // The script run with --yes: exit code and output.
    const { code, output } = runScript('--yes')

    expect(code, output).toBe(0)
    expect(output).toContain('Auto-merge could not be turned on')
    expectMergedAndCleanedUp()
  }, 30_000)

  it('stops when CI fails, turning auto-merge off and merging nothing', () => {
    pushedBranch()
    setGitHub({ required: true, checks: ['pending', 'pending', 'fail'] })

    // The script run with --yes: exit code and output.
    const { code, output } = runScript('--yes')

    expect(code).toBe(1)
    expect(output).toContain('CI failed (CI)')
    // Auto-merge turned on while waiting, then off again; nothing reached main.
    expect(callsOf('pr', 'merge').some(call => call.includes('--disable-auto'))).toBe(true)
    expect(gitHub().prs[0]).toMatchObject({ state: 'OPEN', autoMergeRequest: null })
    expect(remoteMainSubject()).toBe('Initial commit')
    // Still on the branch, which is still on GitHub.
    expect(currentBranch()).toBe('feat/thing')
    expect(remoteBranches()).toContain('feat/thing')
  }, 30_000)

  it('reuses the pull request already open for the branch', () => {
    pushedBranch()
    // A pull request left open by an earlier run (CI had failed, then a fix was pushed).
    setGitHub({ prs: [{ number: 1, state: 'OPEN', url: 'https://github.com/owner/repo/pull/1', headRefName: 'feat/thing', headRefOid: git(work, 'rev-parse', 'HEAD'), autoMergeRequest: null }] })

    // The script run with --yes: exit code and output.
    const { code, output } = runScript('--yes')

    expect(code, output).toBe(0)
    expect(output).toContain('Pull request already open')
    expect(callsOf('pr', 'create')).toHaveLength(0)
    expectMergedAndCleanedUp()
  }, 30_000)

  it('only cleans up when the pull request was merged meanwhile (after Ctrl+C)', () => {
    pushedBranch()
    // GitHub merged the branch by auto-merge after the script stopped waiting; the branch is still there.
    // The branch's commit, the one the merged pull request was on.
    const sha = git(work, 'rev-parse', 'HEAD')
    git(work, 'switch', 'main')
    git(work, 'merge', '--no-ff', '-m', 'Merge feat/thing (2 commits)\n\n- Add a\n- Add b', 'feat/thing')
    git(work, 'push', 'origin', 'main')
    git(work, 'reset', '--hard', 'HEAD~1')
    git(work, 'switch', 'feat/thing')
    setGitHub({ prs: [{ number: 1, state: 'MERGED', url: 'https://github.com/owner/repo/pull/1', headRefName: 'feat/thing', headRefOid: sha }] })

    // The script run with --yes: exit code and output.
    const { code, output } = runScript('--yes')

    expect(code, output).toBe(0)
    expect(output).toContain('already merged')
    expect(callsOf('pr', 'create')).toHaveLength(0)
    expectMergedAndCleanedUp()
  }, 30_000)

  it('only cleans up when the merged branch is already gone from GitHub', () => {
    pushedBranch()
    // As above, with the repository deleting merged branches: no remote branch left.
    // The branch's commit, the one the merged pull request was on.
    const sha = git(work, 'rev-parse', 'HEAD')
    git(work, 'switch', 'main')
    git(work, 'merge', '--no-ff', '-m', 'Merge feat/thing (2 commits)\n\n- Add a\n- Add b', 'feat/thing')
    git(work, 'push', 'origin', 'main')
    git(work, 'reset', '--hard', 'HEAD~1')
    git(work, 'push', 'origin', '--delete', 'feat/thing')
    git(work, 'switch', 'feat/thing')
    setGitHub({ prs: [{ number: 1, state: 'MERGED', url: 'https://github.com/owner/repo/pull/1', headRefName: 'feat/thing', headRefOid: sha }] })

    // The script run with --yes: exit code and output.
    const { code, output } = runScript('--yes')

    expect(code, output).toBe(0)
    expect(output).toContain('already merged')
    expectMergedAndCleanedUp()
  }, 30_000)

  it('runs the checks first, and opens nothing when they fail', () => {
    pushedBranch()

    // The script run with --yes, its checks failing.
    const { code, output } = runScriptWithChecks(checkExiting(1), '--yes')

    expect(code).toBe(1)
    expect(output).toContain('The checks failed')
    // No pull request, nothing merged or deleted: still on the branch, main untouched.
    expect(callsOf('pr', 'create')).toHaveLength(0)
    expect(currentBranch()).toBe('feat/thing')
    expect(remoteMainSubject()).toBe('Initial commit')
    expect(remoteBranches()).toContain('feat/thing')
  }, 30_000)

  it('skips the local checks with --no-checks, CI still deciding', () => {
    pushedBranch()

    // Checks that would fail, skipped.
    const { code, output } = runScriptWithChecks(checkExiting(1), '--yes', '--no-checks')

    expect(code, output).toBe(0)
    expect(output).toContain('Checks skipped')
    expectMergedAndCleanedUp()
  }, 30_000)

  it('stops when gh is missing or signed out', () => {
    pushedBranch()
    setGitHub({ authOk: false })
    // The script run with --yes: exit code and output.
    const { code, output } = runScript('--yes')
    expect(code).toBe(1)
    expect(output).toContain('gh auth login')
  })

  it('stops when the commit email is not the GitHub noreply address', () => {
    pushedBranch()
    git(work, 'config', 'user.email', 'someone@example.com')
    // The script run with --yes: exit code and output.
    const { code, output } = runScript('--yes')
    expect(code).toBe(1)
    expect(output).toContain('noreply')
    expect(callsOf('pr', 'create')).toHaveLength(0)
  })

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
    expect(callsOf('pr', 'create')).toHaveLength(0)
    expect(remoteBranches()).toContain('feat/thing')
  })

  it('stops before opening anything when the branch conflicts with main', () => {
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
    expect(callsOf('pr', 'create')).toHaveLength(0)
    expect(currentBranch()).toBe('feat/thing')
    expect(git(work, 'status', '--porcelain')).toBe('')
    expect(remoteBranches()).toContain('feat/thing')
  }, 30_000)
})
