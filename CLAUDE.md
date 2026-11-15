# CLAUDE.md

Guidance for Claude Code in this repository. The project's full documentation is in [`docs/`](docs/) (index in [README.md](README.md#documentation)); the conventions below summarise [14. Development conventions](docs/14-conventions.md), which wins if the two ever differ.

## The project

Chronovault is a music library and player: Nuxt 4 (Vue 3, TypeScript strict) serving both the pages and the API (`server/api`), Supabase (Postgres with RLS, Auth, Storage for covers), Cloudflare R2 for audio, deployed on Vercel. Architecture and key principles: [5](docs/05-architecture.md); the folder tree: [6](docs/06-project-structure.md); how each feature works end to end: [7](docs/07-data-flows.md).

## Commands

| Task | Command |
|---|---|
| Develop (Supabase in Docker, Nuxt with hot reload on :3100) | `pnpm local` |
| Lint, types, unit and component tests with the coverage floors | `pnpm check` |
| Database tests (pgTAP) · end-to-end tests (Playwright) | `pnpm test:db` · `pnpm test:e2e` |
| Apply new migrations locally, keeping the data | `pnpm db:migrate` |
| Regenerate the database types after a migration | `pnpm db:types` |
| Merge the current branch through a pull request once CI passes | `pnpm merge:main` |

`pnpm db:reset` deletes every local account and track: never run it unasked. Every command: [3](docs/03-commands.md).

## Conventions

- **English** everywhere in the repository: code, comments, docs, UI text, commit messages. Replies to the maintainer are in Italian. The name is written "Chronovault", one capital, never "ChronoVault"; lowercase `chronovault` stays in identifiers.
- **A branch per task** from `main` (`feat/…`, `fix/…`, `docs/…`, `chore/…`); commit messages follow Conventional Commits (`feat: …`, `fix: …`); nothing reaches `main` without a green CI ([14.1](docs/14-conventions.md#141-git-workflow)).
- **Layered backend:** a route only authenticates, validates and calls a service; rules live in services (unit-tested without Nuxt), queries in repositories, conversions in mappers.
- **The server acts as the user**: never use the Supabase service key; Row Level Security decides what each request can reach.
- **A new table or column:** migration with RLS policies and grants → `pnpm db:migrate` → pgTAP tests → `pnpm db:types` → mapper → repository → service → route. Applied migrations are never edited.
- **Comments explain why** (a constraint, a trade-off, a platform quirk, an invariant), never what the code already says, how the framework works, a line's history, or a pointer to the docs ([14.2](docs/14-conventions.md#142-code-conventions)).
- **Docs follow the code:** a change updates the section of `docs/` it touches in the same commit, describing the current state.
- **A new origin the browser must reach** goes into the Content Security Policy (`server/utils/content-security-policy.ts`).

## Working with the maintainer

- **Two computers, one set of rules:** the project is worked on from a Windows PC and a Mac. A new working preference or rule goes into this file (or the conventions it points to) in the same branch, never into Claude's memory, which stays on one computer.
- **At the start of a task**, create its branch from an up-to-date `main` and say its name. If the working tree holds uncommitted changes from an earlier task, say so before branching.
- **Never commit, push or merge unless asked**: the maintainer does it. Before a commit, this clone's `git config --local user.email` must be the GitHub noreply address; a computer's global address must never reach the public history.
- **No AI attribution** anywhere: no `Co-Authored-By`, no "Generated with Claude Code", in commits, pull requests or commit message drafts.
- **Experiments stay off `main`**: a diagnostic page or a spike lives on its own branch. Agent design specs and implementation plans are kept outside the repository, never in `docs/`; a decision worth keeping gets a few lines in the docs section it concerns.
- **Casting from Chrome on Android does not work yet** ([16](docs/16-troubleshooting.md#16-troubleshooting)): a change to it starts from the `/cast-test` results on the real phone and TV, not from a guess.
- **At the end of a task**: check the comments, docs and README it touched against [14.2](docs/14-conventions.md#142-code-conventions); give a ready-to-paste commit message, only its text in a code block (English, Conventional Commits, a body when the why is not obvious; no `git` or `pnpm` commands, no heredoc); list briefly the commands that were run.
