# 3. Commands

## 3.1 The whole stack in one command

| Command | What it does | App URL |
|---|---|---|
| `pnpm local` / `make local` | Checks Docker → starts Supabase (if not running) → writes `.env` → runs the Nuxt **dev server** in the foreground. <kbd>Ctrl</kbd>+<kbd>C</kbd> stops Nuxt; Supabase keeps running. | http://localhost:3100 |
| `pnpm docker` / `make docker` | Checks Docker → starts Supabase → writes `.env.docker` → builds the **production image** and starts the container in the background → waits until `/api/health` answers. | http://localhost:8180 |
| `pnpm stop` / `make stop` | Removes the app container and stops Supabase. **Data is kept** (Docker volumes) for the next start. | |
| `make docker-logs` | Follows the app container logs (`docker compose logs -f app`). | |

Docker Desktop is never started automatically: when it is not running, the commands stop with a clear message. Both modes use the same local Supabase, so they share the same accounts and tracks.

## 3.2 `package.json` scripts

| Script | What it does |
|---|---|
| `pnpm local` · `pnpm docker` · `pnpm stop` | The whole stack, see above (`scripts/stack.mjs`) |
| `pnpm dev` | Nuxt dev server only, on http://localhost:3100 (Supabase and `.env` must already be there) |
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
| `pnpm db:reset` | Recreate the local database from migrations + seed — **deletes every local account and track** |
| `pnpm db:migration <name>` | Create a new, empty migration file |
| `pnpm db:lint` | Static analysis of the schema (security and performance warnings) |
| `pnpm db:types` | Regenerate `shared/types/database.types.ts` (written only when generation succeeds) |
| `pnpm db:push` | Apply pending migrations to the linked Supabase Cloud project |
| `pnpm env:local` | Write `.env` from the running local stack |
| `pnpm r2:check [origin…]` | Check the Cloudflare R2 setup in `.env.r2`: upload, range streaming, size check, CORS, delete |
| `pnpm generate:brand` | Regenerate the brand images in `public/` (favicon, PWA icons, fallback cover) from `shared/brand.ts` and `brand/chronovault.jpg` ([5.6](05-architecture.md#56-brand-and-theme)) |
| `pnpm doctor` | Check this computer's prerequisites (Node, pnpm, Docker, dependencies, `host.docker.internal`, Playwright's Chromium, Make, local stack) and print the fix for each missing one, on macOS, Windows or Linux. Read-only; works before `pnpm install` as `node scripts/doctor.mjs` |
| `pnpm merge:main [--yes]` | Merge the current (pushed) branch into `main`, push, delete the branch locally and on GitHub, end on an up-to-date `main` ([14.1](14-conventions.md#141-git-workflow)) |

## 3.3 Makefile

`make help` lists every target. On Windows, run `make` from Git Bash (GNU Make is a separate install: `winget install ezwinports.make`) or use the `pnpm` scripts.

| Target | What it does |
|---|---|
| `make local` · `make docker` · `make stop` · `make docker-logs` | The whole stack (see 3.1) |
| `make setup` | First run, step by step: install → `db-start` → `.env` → DB types |
| `make install` · `make env` · `make dev` · `make build` · `make preview` | Single steps |
| `make db-start` · `db-stop` · `db-status` | Local Supabase stack |
| `make db-migrate` | Apply new migrations locally, keeping the data |
| `make db-reset` | Recreate the local database (**deletes local data**) |
| `make db-migration name=<description>` | New migration file |
| `make db-types` · `make db-lint` · `make db-test` | Types · schema analysis · pgTAP tests |
| `make db-studio` | Prints the Supabase Studio address |
| `make db-link ref=<project-ref>` · `make db-push` | Link Supabase Cloud · push migrations to it |
| `make lint` · `lint-fix` · `typecheck` | Code quality |
| `make test` · `test-unit` · `test-nuxt` · `test-e2e` · `test-coverage` | Tests |
| `make check` | lint + typecheck + test-coverage: quick checks before a commit |
| `make ci` | Everything the CI runs (adds `db-lint`, `db-test`, `test-e2e`) |
| `make doctor` | `pnpm doctor` |
| `make merge` · `make merge yes=1` | `pnpm merge:main`: merge the current branch into `main` and clean up · without the confirmation question (make cannot take `--yes`: it would read it as its own option) |
| `make clean` · `make clean-all` | Remove builds and reports · also `node_modules` |

---

← [1. Features](01-features.md) · [Contents](../README.md#documentation) · [4. Tech stack](04-tech-stack.md) →
