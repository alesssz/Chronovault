# 3. Commands

## 3.1 The whole stack in one command

| Command | What it does | App URL |
|---|---|---|
| `pnpm local` / `make local` | **Develop.** Checks Docker → **1/2** starts Supabase in Docker (if not running) → writes `.env` → **2/2** runs the Nuxt **dev server** (pages and API, hot reload) in the foreground. Warns when the `pnpm docker` container is also running, since it serves an older build. <kbd>Ctrl</kbd>+<kbd>C</kbd> stops Nuxt; Supabase keeps running. | http://localhost:3100 |
| `pnpm docker` / `make docker` | **Try the production build.** Checks Docker → starts Supabase → writes `.env.docker` → builds the **production image** and starts the container in the background → waits until `/api/health` answers. No hot reload: run it again after a change. | http://localhost:8180 |
| `make docker-stop` | Stops only the app container of `pnpm docker`; Supabase keeps running. | |
| `pnpm stop` / `make stop` | Removes the app container and stops Supabase. **Data is kept** (Docker volumes) for the next start. Works also without a `.env.docker` (someone who only used `pnpm local`). | |
| `make docker-logs` | Follows the app container logs (`docker compose logs -f app`). | |

Docker Desktop is never started automatically: when it is not running, the commands stop with a clear message. Both modes use the same local Supabase, so they share the same accounts and tracks. Neither starts a separate API server: the API (`server/api`) is part of the Nuxt app, in the dev server or in the container ([5.3](05-architecture.md#53-where-everything-runs)).

## 3.2 `package.json` scripts

| Script | What it does |
|---|---|
| `pnpm local` · `pnpm docker` · `pnpm stop` | The whole stack, see above (`scripts/stack.mjs`) |
| `pnpm dev` | Nuxt dev server only (pages and API), on http://localhost:3100 (Supabase and `.env` must already be there) |
| `pnpm build` · `pnpm preview` | Production build (`.output/`) · serve it locally, on http://localhost:3100 |
| `pnpm lint` · `pnpm lint:fix` | ESLint, formatting rules included · with automatic fixes |
| `pnpm typecheck` | vue-tsc over app, server, shared and config files |
| `pnpm test` | All Vitest tests (unit + components) |
| `pnpm test:unit` · `pnpm test:nuxt` | Unit tests only · component tests only |
| `pnpm test:watch` · `pnpm test:coverage` | Watch mode · totals in the terminal, per-file report in `coverage/index.html`, failing below the floors ([12](12-testing.md#12-testing)) |
| `pnpm test:db` | pgTAP database tests (local Supabase must be running) |
| `pnpm test:e2e` · `pnpm test:e2e:ui` | Playwright end-to-end tests · in UI mode |
| `pnpm check` | lint + typecheck + test:coverage (the tests, with the coverage floors) |
| `pnpm db:start` · `db:stop` · `db:status` | Start / stop the local Supabase stack · print its URLs and keys |
| `pnpm db:migrate` | **Apply new migrations to the local database, keeping its data** |
| `pnpm db:reset` | Start the local data afresh: the stack is stopped without a backup (its Docker volumes deleted) and started again, so the database comes back from the migrations and the seed and the storage comes back empty. It **deletes every local account, track and uploaded file**, and asks first (`--yes` answers) (`scripts/reset-local.mjs`) |
| `pnpm db:reset:database` | The database only (`supabase db reset`, asks first): every account and track goes, the uploaded files stay on disk with nothing pointing to them |
| `pnpm storage:clean` | The files only: deletes the local files no object of the database points to (what a database reset leaves), after saying how many; the database and the files in use stay |
| `pnpm db:migration <name>` | Create a new, empty migration file |
| `pnpm db:lint` | Type check of the SQL functions (plpgsql); fails on any warning |
| `pnpm db:advisors` | Supabase's security and performance advisors on the local database (tables without RLS, unsafe functions, missing indexes…); fails on warnings, lists infos only |
| `pnpm db:types` | Regenerate `shared/types/database.types.ts` (written only when generation succeeds) |
| `pnpm db:types:check` | Fail when the committed `database.types.ts` differs from the schema (a migration added without `pnpm db:types`); writes nothing |
| `pnpm db:push` | Apply pending migrations to the linked Supabase Cloud project, by hand: CI does it on every merge into `main` ([13.5](13-deployment.md#135-updating-production)) |
| `pnpm env:local` | Write `.env` from the running local stack |
| `pnpm r2:check [origin…]` | Check the Cloudflare R2 setup in `.env.r2`: upload (on an address signed for that file, and a file of another size refused), range streaming, size check, CORS, delete |
| `pnpm urls [site]` | Print the main addresses: the local app, Supabase Studio and Mailpit (ports read from `supabase/config.toml`); the site and the dashboards of Supabase (the project `supabase link` recorded), Cloudflare R2, Vercel and GitHub (from the git remote). Read-only, needs nothing running |
| `pnpm generate:brand` | Regenerate the brand images in `public/` (favicon, PWA icons, fallback cover) from `shared/brand.ts` and `brand/chronovault.jpg` ([5.6](05-architecture.md#56-brand-and-theme)) |
| `pnpm run doctor` | Check this computer's prerequisites (Node, pnpm, Docker, dependencies, `host.docker.internal`, Playwright's Chromium, the GitHub CLI signed in, Make, local stack) and print the fix for each missing one, on macOS, Windows or Linux. Read-only; works before `pnpm install` as `node scripts/doctor.mjs`. With `run`: pnpm's own `pnpm doctor` checks pnpm itself |
| `pnpm merge:main [--yes] [--no-checks]` | Run `pnpm check` on the current (pushed) branch, open its pull request, wait for CI and get it merged into `main` (auto-merge, or from the terminal), then delete the branch locally and on GitHub and end on an up-to-date `main`; needs `gh` signed in ([14.1](14-conventions.md#141-git-workflow)) |
| `pnpm github:check` | Compare the repository's settings on GitHub (ruleset, Actions, security features) with the decided ones, and report open alerts and the last runs on `main`; read-only, needs `gh` ([13.8](13-deployment.md#138-the-github-repository)) |

## 3.3 Makefile

`make help` lists every target. On Windows, run `make` from Git Bash (GNU Make is a separate install: `winget install ezwinports.make`) or use the `pnpm` scripts.

| Target | What it does |
|---|---|
| `make local` · `make docker` · `make stop` · `make docker-stop` · `make docker-logs` | The whole stack (see 3.1) |
| `make setup` | First run, step by step: install → `db-start` → `.env` → DB types |
| `make install` · `make env` · `make dev` · `make build` · `make preview` | Single steps |
| `make db-start` · `db-stop` · `db-status` | Local Supabase stack |
| `make db-migrate` | Apply new migrations locally, keeping the data |
| `make db-reset` · `db-reset-database` · `storage-clean` | All the local data afresh (**deletes everything**) · the database only · the unused files only (each asks first; `yes=1` answers) |
| `make db-migration name=<description>` | New migration file |
| `make db-types` · `make db-types-check` · `make db-lint` · `make db-advisors` · `make db-test` | Types · types against the schema · SQL functions' types · Supabase advisors · pgTAP tests |
| `make db-studio` | Prints the Supabase Studio address |
| `make db-link ref=<project-ref>` · `make db-push` | Link Supabase Cloud · push migrations to it by hand (CI does it on every merge into `main`) |
| `make lint` · `lint-fix` · `typecheck` | Code quality |
| `make test` · `test-unit` · `test-nuxt` · `test-e2e` · `test-coverage` | Tests |
| `make check` | lint + typecheck + test-coverage: quick checks before a commit |
| `make ci` | Everything the CI runs (adds `db-lint`, `db-advisors`, `db-types-check`, `db-test`, `test-e2e`) |
| `make doctor` | `pnpm run doctor` |
| `make merge` · `make merge yes=1` · `make merge checks=0` | `pnpm merge:main`: run `pnpm check`, merge the current branch into `main` through a pull request once CI passes, and clean up · without the confirmation question · without the checks (make cannot take `--yes`: it would read it as its own option) |
| `make audit` · `make github-check` | `pnpm audit` · `pnpm github:check` |
| `make urls` | `pnpm urls` with the deployed site |
| `make r2-check` · `make r2-check site=https://<your-domain>` | `pnpm r2:check` with the token in `.env.r2`, its CORS checked from `http://localhost:3100` and the deployed site, [chronovault-music.vercel.app](https://chronovault-music.vercel.app) · another deployment's ([13.2](13-deployment.md#132-cloudflare-r2-audio-files)) |
| `make clean` · `make clean-all` | Remove builds and reports · also `node_modules` |

---

← [2. Quick start](02-quick-start.md) · [Contents](../README.md#documentation) · [4. Tech stack](04-tech-stack.md) →
