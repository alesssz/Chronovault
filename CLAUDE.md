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

- **English** everywhere in the repository: code, comments, docs, UI text, commit messages. The name is written "Chronovault".
- **A branch per task** from `main` (`feat/…`, `fix/…`, `docs/…`, `chore/…`); nothing reaches `main` without a green CI ([14.1](docs/14-conventions.md#141-git-workflow)).
- **Layered backend:** a route only authenticates, validates and calls a service; rules live in services (unit-tested without Nuxt), queries in repositories, conversions in mappers.
- **The server acts as the user**: never use the Supabase service key; Row Level Security decides what each request can reach.
- **A new table or column:** migration with RLS policies and grants → `pnpm db:migrate` → pgTAP tests → `pnpm db:types` → mapper → repository → service → route. Applied migrations are never edited.
- **Comments explain why** (a constraint, a trade-off, a platform quirk, an invariant), never what the code already says, how the framework works, or a line's history ([14.2](docs/14-conventions.md#142-code-conventions)).
- **Docs follow the code:** a change updates the section of `docs/` it touches in the same commit, describing the current state.
- **A new origin the browser must reach** goes into the Content Security Policy (`server/utils/content-security-policy.ts`).
