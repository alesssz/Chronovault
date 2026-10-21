/**
 * Builds the message of the merge commit created by `pnpm merge:main`:
 * a title, then one line per commit of the branch (oldest first).
 *
 *   one commit      Merge feat/x: <its subject>
 *   several         Merge feat/x (3 commits)
 *
 *                   - First commit subject
 *                   - Second commit subject (×2)   ← identical subjects are grouped
 */

/**
 * @param {string} branch the branch being merged
 * @param {string[]} subjects commit subjects of the branch, oldest first (merge commits excluded)
 * @returns {string} the full commit message
 */
export function buildMergeMessage(branch, subjects) {
  const cleaned = subjects.map(s => s.trim()).filter(Boolean)
  if (cleaned.length === 0) return `Merge ${branch}`
  if (cleaned.length === 1) return `Merge ${branch}: ${cleaned[0]}`

  // Group repeated subjects (e.g. several "Fix typo") while keeping the first-seen order.
  const counts = new Map()
  for (const subject of cleaned) counts.set(subject, (counts.get(subject) ?? 0) + 1)
  // One "- subject" line per distinct subject, with "(×N)" when repeated.
  const lines = [...counts].map(([subject, n]) => `- ${subject}${n > 1 ? ` (×${n})` : ''}`)

  return `Merge ${branch} (${cleaned.length} commits)\n\n${lines.join('\n')}`
}
