# 14. Development conventions

## 14.1 Git workflow

Every task gets its own branch from `main`, with a short English name and a type prefix: `feat/editable-queue`, `fix/cover-upload`, `docs/readme`, `chore/merge-command`.

```bash
git switch main && git pull
git switch -c feat/<name>
# … work, commit, push …
git push -u origin feat/<name>     # CI runs on the branch; Vercel builds a preview deployment
pnpm merge:main                    # or: make merge: pull request, CI, merge, clean-up
```

**Nothing reaches `main` without a green CI.** `main` deploys to production as soon as it changes, and the database and end-to-end tests run only on GitHub (`.github/workflows/ci.yml`, on every pushed branch). So a branch goes in through a pull request that GitHub merges only once CI passes; `main`'s ruleset refuses a direct push and a merge with red or missing checks ([13.8](13-deployment.md#138-the-github-repository)). `pnpm merge:main` does it all from the terminal, with `gh` (GitHub's command line, signed in once: [0.3](00-setup.md#03-getting-the-code)). Follow CI at any time with `gh run watch`, or on GitHub (the Actions tab, the pull request's Checks); GitHub emails you when a run fails.

`pnpm merge:main` (`scripts/merge-main.mjs`):

| Situation | What happens |
|---|---|
| You are on `main` | "Already on main", nothing else |
| `gh` missing or signed out, or this clone's commit email is not the GitHub noreply address | Stops before anything else (the merge commit carries that email into a public repository) |
| Uncommitted changes | Stops: commit (and push) or stash them first |
| The branch was never pushed, or has local commits not pushed | Stops: push first |
| GitHub has commits on the branch you don't have | Stops: pull first |
| Your local `main` has unpushed commits | Stops |
| Nothing new compared to `main` | Stops |
| Conflicts with `main` (found with `git merge-tree`, without touching your files) | Stops before opening anything: merge `main` into the branch, fix, push, run again |
| `pnpm check` fails (lint, typecheck, tests with the coverage floors), run on the branch | Stops, nothing opened: fix, push, run again. `pnpm merge:main --no-checks` (or `make merge checks=0`) skips them, e.g. for a docs-only branch; CI still runs them |
| Ready | Shows the commits and the merge message, asks `[y/N]` (`pnpm merge:main --yes` or `make merge yes=1` skip the question) |
| Confirmed | Opens the pull request (or reuses the one open for the branch) and waits for CI, printing where it stands. With the ruleset requiring the checks it turns on **auto-merge**: GitHub merges as soon as CI passes, even if the terminal is closed (Ctrl+C only stops the waiting). Without auto-merge it merges from the terminal once every check passed. Either way: a merge commit (`--no-ff`) with the message below, a noreply author, and only the commit checked here (`--match-head-commit`). The author: from the terminal, the clone's noreply email, named explicitly; by auto-merge, the account's commit email for web operations, the noreply one with the emails kept private ([13.8](13-deployment.md#138-the-github-repository)): GitHub refuses a named noreply email there |
| CI fails | Auto-merge off again, nothing merged, the pull request left open: fix, push, run again (the same pull request is reused) |
| Merged | Switches to `main`, pulls it, deletes the branch on GitHub (unless GitHub already did) and locally. Production follows by itself: CI on `main`, its migrations, then Vercel puts the new code online ([13.5](13-deployment.md#135-updating-production)) |
| Run again after a merge done meanwhile (after Ctrl+C) | Only the clean-up |
| GitHub stops answering while waiting | Tries again for about two minutes, then stops; the pull request stays, and with auto-merge on it still merges. Run again to finish |

The merge commit message sums up the branch: the commit subject when there is a single commit (`Merge feat/x: Add an editable play queue`), otherwise `Merge feat/x (N commits)` followed by one line per commit, oldest first, with repeated subjects grouped.

R2 accepts uploads only from the origins in its CORS policy: uploads from a Vercel **preview** URL fail unless that origin is added too. Playback and everything else work on previews.

## 14.2 Code conventions

- **Language:** everything in the repository is in English (code, comments, docs, UI text, commit messages).
- **Comments explain why.** A comment records what the code cannot say by itself: a constraint (Vercel's 4.5 MB request limit), a trade-off and the alternative turned down, a browser or platform quirk, an invariant other code relies on, the bug a line prevents. The test: would a colleague need it to change this code without breaking it?
  - A file whose role is not clear from its name and folder starts with a short header: what it is for and how it fits in. An exported function or type gets a doc comment when its contract (inputs, errors, side effects) is not clear from its signature.
  - No comment restates the code, describes a variable its name already describes, explains how TypeScript, Vue, Nuxt or Supabase work, or tells a line's history ("used to…", how a bug was found): history belongs in the commit message.
  - Large Vue templates may label their main blocks, where it helps to find one's way. Tests name their scenario in the test title; a comment adds only what the title cannot (why a fixture looks the way it does).
  - In templates, an HTML comment goes above an element, never between its attributes; in a page it stays inside the root element (Nuxt counts a root-level comment as a second root).
  - Applied SQL migrations are never edited, statements or comments: a change is a new migration.
- **Style:** ESLint with stylistic rules, no Prettier (2 spaces, no semicolons, single quotes). `make lint-fix` fixes what it can; VS Code fixes on save (`.vscode/settings.json`).
- **Components:** Nuxt prefixes a component with its folder (`components/track/TrackCover.vue` → `<TrackCover>`); files already carry the full name, and the typecheck flags unknown components.
- **New endpoint:** a route in `server/api/` only authenticates (`requireAuth`, or `visitorClient` for public routes), validates (`readValidated`, `requireUuidParam`) and calls a service. Rules live in the service, tested without Nuxt; queries in a repository; conversions in a mapper.
- **New table or column:** migration (RLS policies + explicit `grant`s) → `make db-migrate` → pgTAP tests → `make db-types` → mapper → repository → service → route → `app/services/api.ts`.
- **Lists that grow with the user's data** are read with `readAllPages` (`server/repositories/pages.ts`), ordered by a unique key: a single query stops at 1000 rows without an error.
- **A layout chosen by window width on a server-rendered page** (`v-if` on a media query) uses `useMountedMediaQuery`, not `useMediaQuery`: the server renders the `false` case, and the browser's first pass must render it too, or Vue reports a hydration mismatch (the end-to-end tests fail on it). What `false` renders must look right on every screen until the switch (CSS can hide what does not fit).
- **Shared code:** anything both sides need goes in `shared/` (pure code: no browser or Node APIs).
- **Reuse before writing:** API calls behind a button go through `useAsyncTask`, edit forms through `useEditForm`, covers through `useCoverEditor`, labels through `pluralize` / `joinParts`… The full list is in [5.5](05-architecture.md#55-reusable-building-blocks); a pattern that appears a second time becomes a helper there.
- **Icon-only buttons** are `<IconButton label="…">`, never a bare `UButton` with an `aria-label`: the label becomes the tooltip too, so mouse users see what screen readers hear. A button that shows its text from `sm` up keeps `UButton` + `aria-label` (a tooltip would repeat it). Other meaningful icons (status badges, grips) get a `UTooltip` with `:content="{ side: 'top' }"`, like `IconButton`: above the element (the player bar sits at the bottom of the screen), below when there is no room above. A tooltip that can open over something clickable also gets `disable-hoverable-content`, as `IconButton` does. Tooltips do not open on touch or on disabled buttons, so never put information *only* in a tooltip.
- **Two kinds of page.** A **section** is a page the header links to (Library, Playlists, Versions, Stats): the container's full width, no back button, the header is the way there and back. A **sub-page** is one task or one item reached from a section (Upload, Export & import metadata, a track's editor, a playlist's page): a back `IconButton` (`i-lucide-arrow-left`, "Back to library" / "Back to playlists"…) before the `h1`, in a row of their own (`mb-6 flex items-center gap-2`), and a container as narrow as its content allows, so lines stay readable on wide screens: `max-w-3xl` for a single column read top to bottom (Upload), `max-w-4xl` when its rows set two values side by side (the import's before → after), `max-w-5xl` for two columns (the cover beside the form, in the editor and on a playlist's page). **A 16rem side column starts at `lg`**, never `md`: at a tablet's 820px it left the content about 400px, and titles broke mid-word; below `lg` the page is one column, the cover a compact row on top (`TrackCoverPicker`, whose `lg:` classes follow the grid). A new page picks the kind first, then the width; a page reached from the account menu (not the header) is a sub-page, "Back to library".
- **Documentation:** `README.md` holds only the introduction (what the app does, its engineering highlights, the stack), a short quick start and the index; everything else is in `docs/`, one file per numbered section (`docs/07-data-flows.md` is section 7; setup is section 0, `docs/00-setup.md`). A change to how the project is installed, started or stopped also updates [0](00-setup.md) and [2](02-quick-start.md). A change updates the section it touches, in the same commit. The docs describe the project as it is now, for a developer joining it: no history of how a part came to be (that is in the commit messages), and no design notes for a single change (they go in its pull request). Headings keep their numbers, and references give them ("see 7.5", in the docs and in code comments: `docs/07-data-flows.md` 7.5). A new section is a new `docs/NN-name.md`, a row in the README's index, and the previous and next pages' navigation lines at the bottom.
- **Backlog:** work known and waiting goes in [`docs/backlog.md`](backlog.md), one entry per point with an ID (`UI-5`, `FEAT-1`) that is never reused. The branch that does a point deletes its entry in the same commit; a point found along the way that does not belong to the branch gets an entry instead of a fix on the side.
- **Never** use the Supabase service key in the app, and never put storage credentials in client code or in git.
- **A new origin the browser must reach** (a script, an API, a media host) goes into the Content Security Policy (`server/utils/content-security-policy.ts`), or production blocks it: the end-to-end tests fail on the first blocked request ([12](12-testing.md#12-testing)).

---

← [13. Deployment (Supabase + Cloudflare R2 + Vercel)](13-deployment.md) · [Contents](../README.md#documentation) · [15. Known limitations and next steps](15-limitations-and-next-steps.md) →
