# 2. Quick start

The everyday commands, for a computer already set up. Setting one up, from installing Node to wiping everything: [0. Setup](00-setup.md#0-setup). Every command, with its options: [3. Commands](03-commands.md#3-commands).

```bash
pnpm install       # after a pull that changed the dependencies (the package store lives in .pnpm-store/)
pnpm local         # Docker Desktop open → 1. Supabase in Docker + .env  2. Nuxt (pages + API) here, hot reload
```

Open **http://localhost:3100** and sign in with **`demo@chronovault.local` / `chronovault`** (or create an account: email confirmation is off locally). <kbd>Ctrl</kbd>+<kbd>C</kbd> stops the app; `pnpm stop` stops Supabase too, keeping the data. There is no separate API server to start: the API (`server/api`) runs inside Nuxt, and reloads with the pages ([5.3](05-architecture.md#53-where-everything-runs)).

## 2.1 I want to…

| I want to… | Command |
|---|---|
| Develop with hot reload (pages and API) | `pnpm local` (or `make local`) → http://localhost:3100 |
| Run the production build in a container | `pnpm docker` (or `make docker`) → http://localhost:8180; logs: `make docker-logs`. It shows the code of its last `pnpm docker`: run it again after a change |
| Stop only that container (Supabase keeps running) | `make docker-stop` |
| Stop everything (data is kept) | `pnpm stop` (or `make stop`) |
| Look inside the database | Supabase Studio → http://127.0.0.1:54323 |
| Read the emails the local sign-in sends | Mailpit → http://127.0.0.1:54324 |
| Bring in what others pushed | `git switch main && git pull`, `pnpm install`, `pnpm db:migrate` ([0.7](00-setup.md#07-after-pulling-new-code)) |
| Apply a new migration locally | `pnpm db:migrate` (keeps your data) |
| Write a migration | `make db-migration name=<description>` → the SQL → `make db-migrate` → `make db-test` → `make db-types` ([13.5](13-deployment.md#135-updating-production)) |
| Start a piece of work | `git switch main && git pull`, then `git switch -c feat/<name>` (or `fix/`, `docs/`, `chore/`) ([14.1](14-conventions.md#141-git-workflow)) |
| Run all checks before a commit | `make check` (lint, types, unit tests with the coverage floors) |
| Run the end-to-end tests | `make test-e2e` (Supabase running; builds the app and serves it on :3200) |
| See whether CI passed on my branch | GitHub → *Actions*, or the mark next to the branch's last commit |
| Merge the current branch into main and delete it | `pnpm merge:main` (or `make merge`): runs `pnpm check` first, see [14.1](14-conventions.md#141-git-workflow). Pushing `main` deploys to production |
| Start the local data afresh | `pnpm db:reset` (**deletes every local account and track**; the demo account comes back) |
| Check a computer's prerequisites | `node scripts/doctor.mjs` (or `pnpm doctor`, `make doctor`) |
| Fix an error message | [16. Troubleshooting](16-troubleshooting.md#16-troubleshooting) |

---

← [1. Features](01-features.md) · [Contents](../README.md#documentation) · [3. Commands](03-commands.md) →
