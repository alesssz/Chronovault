# 14. Development conventions

## 14.1 Git workflow

Every task gets its own branch from `main`, with a short English name and a type prefix: `feat/editable-queue`, `fix/cover-upload`, `docs/readme`, `chore/merge-command`.

```bash
git switch main && git pull
git switch -c feat/<name>
# … work, commit, push …
git push -u origin feat/<name>     # CI runs on the branch; Vercel builds a preview deployment
pnpm merge:main                    # or: make merge (runs pnpm check first)
```

**CI runs on every pushed branch** (`.github/workflows/ci.yml`), not only on `main`: branches are merged locally and `main` deploys to production as soon as it is pushed, so the branch's run is the check that comes before production. Look at it on GitHub (the Actions tab, or the mark next to the branch's last commit) before merging; GitHub emails you when a run fails. The database and end-to-end tests run only there; `pnpm merge:main` runs the quick ones itself.

`pnpm merge:main` (`scripts/merge-main.mjs`):

| Situation | What happens |
|---|---|
| You are on `main` | "Already on main", nothing else |
| Uncommitted changes | Stops: commit (and push) or stash them first |
| The branch was never pushed, or has local commits not pushed | Stops: push first |
| GitHub has commits on the branch you don't have | Stops: pull first |
| Your local `main` has unpushed commits | Stops |
| Nothing new compared to `main` | Stops |
| `pnpm check` fails (lint, typecheck, tests with the coverage floors), run on the branch before anything else | Stops, nothing merged: fix, push, run again. `pnpm merge:main --no-checks` (or `make merge checks=0`) skips them, e.g. for a docs-only branch |
| Ready | Shows the commits and the merge message, asks `[y/N]` (`pnpm merge:main --yes` or `make merge yes=1` skip the question) |
| Confirmed | Updates `main`, merges with a merge commit (`--no-ff`), pushes `main` (production deploy on Vercel), deletes the branch on GitHub and locally, leaves you on `main` in sync |
| Merge conflicts | The merge is aborted and you are back on your branch, unchanged: merge `main` into it, fix, push, run again |
| Pushing `main` fails | The merge stays local and the branch is kept; run `git push` on `main` |

The merge commit message sums up the branch: the commit subject when there is a single commit (`Merge feat/x: Add an editable play queue`), otherwise `Merge feat/x (N commits)` followed by one line per commit, oldest first, with repeated subjects grouped.

R2 accepts uploads only from the origins in its CORS policy: uploads from a Vercel **preview** URL fail unless that origin is added too. Playback and everything else work on previews.

## 14.2 Code conventions

- **Language:** everything in the repository is in English (code, comments, docs, UI text, commit messages).
- **Comments, in depth:** every file starts with what it is for and how it fits in; every function, exported constant, type field and non-trivial computed/watch has a doc comment; every local constant or variable gets a short line saying what it holds (one line may cover a group that belongs together, like hours, minutes and seconds); non-obvious lines explain *why*; the main blocks of Vue templates are labelled; tests describe their fixtures and scenarios. SQL migrations get comments only — their statements never change once applied.
  - In templates, an HTML comment goes above an element, never between its attributes; in a page it stays inside the root element (Nuxt counts a root-level comment as a second root).
- **Style:** ESLint with stylistic rules, no Prettier (2 spaces, no semicolons, single quotes). `make lint-fix` fixes what it can; VS Code fixes on save (`.vscode/settings.json`).
- **Components:** Nuxt prefixes a component with its folder (`components/track/TrackCover.vue` → `<TrackCover>`); files already carry the full name, and the typecheck flags unknown components.
- **New endpoint:** a route in `server/api/` only authenticates (`requireAuth`, or `visitorClient` for public routes), validates (`readValidated`, `requireUuidParam`) and calls a service. Rules live in the service, tested without Nuxt; queries in a repository; conversions in a mapper.
- **New table or column:** migration (RLS policies + explicit `grant`s) → `make db-migrate` → pgTAP tests → `make db-types` → mapper → repository → service → route → `app/services/api.ts`.
- **Lists that grow with the user's data** are read with `readAllPages` (`server/repositories/pages.ts`), ordered by a unique key: a single query stops at 1000 rows without an error.
- **Shared code:** anything both sides need goes in `shared/` (pure code: no browser or Node APIs).
- **Reuse before writing:** API calls behind a button go through `useAsyncTask`, edit forms through `useEditForm`, covers through `useCoverEditor`, labels through `pluralize` / `joinParts`… The full list is in [5.5](05-architecture.md#55-reusable-building-blocks); a pattern that appears a second time becomes a helper there.
- **Icon-only buttons** are `<IconButton label="…">`, never a bare `UButton` with an `aria-label`: the label becomes the tooltip too, so mouse users see what screen readers hear. A button that shows its text from `sm` up keeps `UButton` + `aria-label` (a tooltip would repeat it). Other meaningful icons (status badges, grips) get a `UTooltip` with `:content="{ side: 'top' }"`, like `IconButton`: above the element (the player bar sits at the bottom of the screen), below when there is no room above. A tooltip that can open over something clickable also gets `disable-hoverable-content`, as `IconButton` does. Tooltips do not open on touch or on disabled buttons, so never put information *only* in a tooltip.
- **Documentation:** `README.md` holds only the introduction, a short quick start and the index; everything else is in `docs/`, one file per numbered section (`docs/07-data-flows.md` is section 7; setup is section 0, `docs/00-setup.md`). A change to how the project is installed, started or stopped also updates [0](00-setup.md) and [2](02-quick-start.md). A change updates the section it touches, in the same commit. Headings keep their numbers, and references give them ("see 7.5", in the docs and in code comments: `docs/07-data-flows.md` 7.5). A new section is a new `docs/NN-name.md`, a row in the README's index, and the previous and next pages' navigation lines at the bottom.
- **Never** use the Supabase service key in the app, and never put storage credentials in client code or in git.
- **A new origin the browser must reach** (a script, an API, a media host) goes into the Content Security Policy (`server/utils/content-security-policy.ts`), or production blocks it: the end-to-end tests fail on the first blocked request ([12](12-testing.md#12-testing)).

---

← [13. Deployment (Supabase + Cloudflare R2 + Vercel)](13-deployment.md) · [Contents](../README.md#documentation) · [15. Known limitations and next steps](15-limitations-and-next-steps.md) →
