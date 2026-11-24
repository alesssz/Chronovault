# Backlog

Work that is known and waiting: bugs, interface fixes, features, backend and data changes, tooling, docs. One entry per point, each small enough to be picked up and finished on its own, with what is wrong (or missing), where, the options and the one recommended.

This page is not a numbered section of the docs: it changes all the time, and it empties as work gets done. Known limitations and large directions (a TV page, richer casting…) stay in [15](15-limitations-and-next-steps.md); a direction becomes entries here once it is cut into pieces that can be done one at a time.

## How this page works

- **One point, one branch.** A point is taken up on its own branch from `main` ([14.1](14-conventions.md#141-git-workflow)), named after its kind (`fix/…`, `feat/…`, `chore/…`, `docs/…`); several small points may share one.
- **Done means deleted.** The branch that does a point removes its entry from this page, in the same commit as the change. What the change did is told by the commit and by the section it touched (features, data flows…), not here.
- **IDs are never reused.** Each entry has an area prefix and a number (`UI-5`, `BE-2`), kept for good: "UI-5" means the same thing in a branch name, a commit or a chat. Gaps in the numbering are points already done. Each area counts on its own; the next number is one above the highest ever used in that area (`git log -S "UI-" -- docs/backlog.md` finds deleted ones).
- **Areas** appear when they get their first entry and go when they empty:

  | Prefix | Area |
  |---|---|
  | `UI` | Interface: layout, interaction, accessibility, on desktop and phones |
  | `FEAT` | New features, or changes to what an existing one does |
  | `BE` | Server: API routes, services, storage, performance |
  | `DATA` | Database: schema, migrations, security rules |
  | `OPS` | Tooling, CI, deployment, local stack, dependencies |
  | `DOCS` | Documentation |

  A point that touches several areas goes where most of the work is.
- **Priority** is high (broken, or in the way of using the app), medium (worse than it should be) or low (polish). Within an area entries are in the order they were added, not by priority.
- **An empty page is the goal.** When the last entry goes, each area says "Nothing pending." and the page stays as the place for the next ones.

### Template

```markdown
### UI-n Short statement of the problem

**Priority:** high | medium | low · **Kind:** e.g. layout bug, phones, missing feature · **Found:** YYYY-MM-DD

**What is wrong.** What happens, where it shows, how to see it (sizes, steps, data), and why it matters.

**Where.** Files and parts of them ([Name.vue](../app/…)).

**Options.**
- A) …
- B) …

**Recommended.** Which option, why, and how to check it is done.
```

## Tooling (OPS)

### OPS-4 Production cannot be emptied in one go (database, covers, R2)

**Priority:** low · **Kind:** deployment, storage · **Found:** 2026-11-22

**What is wrong.** Starting production over (after test uploads, or before opening it to other people) means three separate manual steps: the database on Supabase, the `covers` bucket in Supabase Storage, and the `chronovault-audio` bucket on R2, whose dashboard deletes objects page by page. Forgetting one leaves tracks without files, or files without tracks: on R2 these are paid for per GB and can never be reached again.

**Where.** A new script in [scripts/](../scripts/), reusing the `aws4fetch` client and the `.env.r2` credentials of [check-r2.mjs](../scripts/check-r2.mjs); a target in the [Makefile](../Makefile) and a script in [package.json](../package.json); a new subsection in [13-deployment.md](13-deployment.md), and [03-commands.md](03-commands.md).

**Options.**
- A) One command (`pnpm prod:reset`, `make prod-reset`) that shows the linked project ref, the number of users and tracks and the number of objects in `covers` and on R2, asks the user to type the project ref, then: empties `covers` (`supabase storage rm -r ss:///covers --linked --experimental`, so no service key enters the repository); resets the database (`supabase db reset --linked --no-seed`: the demo user, whose password is public, must never exist in production); empties the R2 bucket (list and delete, 1,000 objects at a time). `covers` goes first because Storage lists files through their rows, which the database reset may remove; R2 is listed directly and does not depend on them. Each step can be run again if one fails half way.
- B) A checklist of the three manual steps in 13-deployment. Nothing to maintain, but nothing makes sure they are all done, and emptying a large R2 bucket by hand is slow.

**Recommended.** A). It refuses to run when `CI` is set or `.env.r2` is missing, and no other target calls it. Before writing it, check on a throwaway Supabase project and R2 bucket, never on production, what `supabase db reset --linked` does to `auth.users` and `storage.objects`, and that the `.env.r2` token (*Object Read & Write*) can list and delete. Done when, on that throwaway pair with a few uploads, the command leaves no users, no tracks and no objects in either bucket, `supabase migration list --linked` shows every migration applied, and a new account can sign up and upload.
