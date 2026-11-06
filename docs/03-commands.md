# 3. Commands

## 3.1 The whole stack in one command

| Command | What it does | App URL |
|---|---|---|
| `pnpm local` / `make local` | Checks Docker → starts Supabase (if not running) → writes `.env` → runs the Nuxt **dev server** in the foreground. <kbd>Ctrl</kbd>+<kbd>C</kbd> stops Nuxt; Supabase keeps running. | http://localhost:3100 |
| `pnpm docker` / `make docker` | Checks Docker → starts Supabase → writes `.env.docker` → builds the **production image** and starts the container in the background → waits until `/api/health` answers. | http://localhost:8180 |
| `pnpm stop` / `make stop` | Removes the app container and stops Supabase. **Data is kept** (Docker volumes) for the next start. Works also without a `.env.docker` (someone who only used `pnpm local`). | |
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
| `pnpm db:lint` | Type check of the SQL functions (plpgsql); fails on any warning |
| `pnpm db:advisors` | Supabase's security and performance advisors on the local database (tables without RLS, unsafe functions, missing indexes…); fails on warnings, lists infos only |
| `pnpm db:types` | Regenerate `shared/types/database.types.ts` (written only when generation succeeds) |
| `pnpm db:types:check` | Fail when the committed `database.types.ts` differs from the schema (a migration added without `pnpm db:types`); writes nothing |
| `pnpm db:push` | Apply pending migrations to the linked Supabase Cloud project |
| `pnpm env:local` | Write `.env` from the running local stack |
| `pnpm r2:check [origin…]` | Check the Cloudflare R2 setup in `.env.r2` (written by hand, [13.2](13-deployment.md#132-cloudflare-r2-audio-files)): upload (on an address signed for that file, and a file of another size refused), range streaming, size check, CORS, delete. An empty value, a placeholder such as `[SENSITIVE]` or an endpoint that is no URL is named before any request, as in `flac:seektable` |
| `pnpm flac:seektable [--env <file>] [--apply]` | Add a SEEKTABLE to the FLACs already in the audio storage ([7.4](07-data-flows.md#74-lossless-wav--flac-conversion)): the local stack by default, R2 with `--env .env.r2` ([13.5](13-deployment.md#135-updating-production)); storage only, never the database. Lists what it would do; writes only with `--apply`; safe to run again |
| `pnpm generate:brand` | Regenerate the brand images in `public/` (favicon, PWA icons, fallback cover) from `shared/brand.ts` and `brand/chronovault.jpg` ([5.6](05-architecture.md#56-brand-and-theme)) |
| `pnpm doctor` | Check this computer's prerequisites (Node, pnpm, Docker, dependencies, `host.docker.internal`, Playwright's Chromium, Make, local stack) and print the fix for each missing one, on macOS, Windows or Linux. Read-only; works before `pnpm install` as `node scripts/doctor.mjs` |
| `pnpm merge:main [--yes] [--no-checks]` | Run `pnpm check` on the current (pushed) branch, then merge it into `main`, push, delete the branch locally and on GitHub, end on an up-to-date `main` ([14.1](14-conventions.md#141-git-workflow)) |

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
| `make db-types` · `make db-types-check` · `make db-lint` · `make db-advisors` · `make db-test` | Types · types against the schema · SQL functions' types · Supabase advisors · pgTAP tests |
| `make db-studio` | Prints the Supabase Studio address |
| `make db-link ref=<project-ref>` · `make db-push` | Link Supabase Cloud · push migrations to it |
| `make r2-check` · `make r2-check origin=https://<site>` | `pnpm r2:check`: the R2 setup in `.env.r2` · with that site's CORS |
| `make flac-seektable` · `env=.env.r2` · `apply=1` | `pnpm flac:seektable`: seek tables for the FLACs already stored, on the local stack · on R2 · writing (only lists without it); e.g. `make flac-seektable env=.env.r2 apply=1` |
| `make lint` · `lint-fix` · `typecheck` | Code quality |
| `make test` · `test-unit` · `test-nuxt` · `test-e2e` · `test-coverage` | Tests |
| `make check` | lint + typecheck + test-coverage: quick checks before a commit |
| `make ci` | Everything the CI runs (adds `db-lint`, `db-advisors`, `db-types-check`, `db-test`, `test-e2e`) |
| `make doctor` | `pnpm doctor` |
| `make merge` · `make merge yes=1` · `make merge checks=0` | `pnpm merge:main`: run `pnpm check`, merge the current branch into `main` and clean up · without the confirmation question · without the checks (make cannot take `--yes`: it would read it as its own option) |
| `make clean` · `make clean-all` | Remove builds and reports · also `node_modules` |

---

← [2. Quick start](02-quick-start.md) · [Contents](../README.md#documentation) · [4. Tech stack](04-tech-stack.md) →
