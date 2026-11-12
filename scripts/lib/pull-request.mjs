/**
 * The pull request side of `pnpm merge:main` (scripts/merge-main.mjs), as pure
 * functions: what the pull request is called, and where its checks stand.
 */

/**
 * Title and description of the pull request opened for a branch.
 *
 *   one commit      title: its subject
 *   several         title: feat/x (3 commits), the subjects listed in the description
 *
 * The merge commit keeps its own message (buildMergeMessage): this is only
 * what GitHub shows on the pull request's page.
 *
 * @param {string} branch the branch being merged
 * @param {string[]} subjects commit subjects of the branch, oldest first (merge commits excluded)
 * @returns {{ title: string, body: string }} the pull request's title and description
 */
export function buildPullRequest(branch, subjects) {
  // The subjects, trimmed, empty ones dropped.
  const cleaned = subjects.map(s => s.trim()).filter(Boolean)
  // How it gets merged, at the end of every description.
  const footer = 'Opened by `pnpm merge:main`: merged into `main` once CI passes.'
  if (cleaned.length === 1) return { title: cleaned[0], body: footer }
  // One "- subject" line per commit, oldest first.
  const list = cleaned.map(subject => `- ${subject}`).join('\n')
  return { title: `${branch} (${cleaned.length} commits)`, body: `${list}\n\n${footer}` }
}

/** Conclusions of a finished check run that count as passed (a skipped job is not a failure). */
const PASSED = new Set(['SUCCESS', 'NEUTRAL', 'SKIPPED'])
/** States of a commit status (the older API some services still use) that count as passed. */
const STATUS_PASSED = new Set(['SUCCESS'])
/** States of a commit status still waiting for an answer. */
const STATUS_PENDING = new Set(['PENDING', 'EXPECTED'])

/**
 * Where the checks of a pull request stand, from `gh pr view --json statusCheckRollup`.
 * The rollup mixes two kinds of entries: check runs (GitHub Actions jobs, CodeQL…),
 * with a status and, once COMPLETED, a conclusion; and commit statuses, with a state.
 *
 * @param {Array<{ __typename?: string, name?: string, context?: string, status?: string, conclusion?: string | null, state?: string }>} rollup
 * @returns {{ passed: string[], pending: string[], failed: string[] }} the checks' names, by outcome
 */
export function summarizeChecks(rollup) {
  // The names, sorted into the three outcomes.
  const summary = { passed: [], pending: [], failed: [] }
  for (const check of rollup ?? []) {
    if (check.__typename === 'StatusContext') {
      // A commit status: its state alone tells. Its name is the service's context (e.g. "Vercel").
      const name = check.context ?? 'status'
      if (STATUS_PASSED.has(check.state)) summary.passed.push(name)
      else if (STATUS_PENDING.has(check.state)) summary.pending.push(name)
      else summary.failed.push(name)
      continue
    }
    // A check run: not finished yet (queued, in progress, waiting…), or finished with a conclusion.
    // Its name is the job's (e.g. "Lint, types and unit tests").
    const name = check.name ?? 'check'
    if (check.status !== 'COMPLETED') summary.pending.push(name)
    else if (PASSED.has(check.conclusion)) summary.passed.push(name)
    // Failure, cancelled, timed out, action required, startup failure: not passed.
    else summary.failed.push(name)
  }
  return summary
}

/**
 * One line telling where the checks stand, printed while waiting.
 *
 * @param {{ passed: string[], pending: string[], failed: string[] }} summary from summarizeChecks
 * @returns {string} e.g. "1 of 2 checks passed, 1 running"
 */
export function describeChecks(summary) {
  // Every check reported so far.
  const total = summary.passed.length + summary.pending.length + summary.failed.length
  if (total === 0) return 'waiting for the checks to start'
  // The passed count, then what is still running or failed, when any.
  const parts = [`${summary.passed.length} of ${total} check${total === 1 ? '' : 's'} passed`]
  if (summary.pending.length) parts.push(`${summary.pending.length} running`)
  if (summary.failed.length) parts.push(`${summary.failed.length} failed`)
  return parts.join(', ')
}
