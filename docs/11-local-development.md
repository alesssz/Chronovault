# 11. Local development in detail

## 11.1 Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | **24.11+** (or 22.21+) | `.nvmrc` pins 24; older versions make Nuxt print a warning |
| pnpm | 12 | `npm i -g pnpm@12.14.0` (pinned in `packageManager`); `corepack enable` also works where Node ships Corepack (Homebrew's Node does not) |
| Docker Desktop | recent | Runs the local Supabase stack (and the app in Docker mode) |
| GNU Make | optional | macOS: comes with `xcode-select --install`. Windows: `winget install ezwinports.make` (not part of Git for Windows). Every target has a `pnpm` equivalent |
| Playwright's Chromium | for e2e tests only | Not your own Chrome: Playwright downloads its own (~150 MB, in `~/Library/Caches/ms-playwright` on macOS). `make test-e2e` installs it when missing |

**Setting up a computer, from installing these tools to the first start, stopping and wiping:** [0. Setup](00-setup.md#0-setup), with the steps for macOS and Windows in [0.2](00-setup.md#02-from-a-blank-computer). `node scripts/doctor.mjs` checks every item of this table and prints the fix for your system.

The Supabase CLI is a dev dependency: no global install needed. pnpm keeps its package store in the project (`.pnpm-store/`, git-ignored, see `pnpm-workspace.yaml`); `node_modules` holds hard links to it, so the space is not used twice even if a file manager counts it twice.

## 11.2 Step by step (what `pnpm local` automates)

The two pieces of [5.3](05-architecture.md#53-where-everything-runs), one after the other: Supabase in Docker (`db:start`, then `.env` from its status), then Nuxt on the host (`dev`), which serves the pages and the API together.

```bash
pnpm install
pnpm db:start        # first time: pulls the Supabase Docker images (a few minutes)
pnpm env:local       # writes .env from `supabase status`
pnpm db:types        # optional: regenerate database types
pnpm dev             # http://localhost:3100
```

or `make setup` followed by `make dev`.

## 11.3 How the Docker mode works

Supabase always runs in the containers managed by the Supabase CLI; only the second piece, Nuxt (pages and API), changes place. `pnpm docker` builds the app image from the `Dockerfile` (multi-stage: dependencies and build in the first stage, only the self-contained `.output/` in the final `node:24-alpine` image, run as the unprivileged `node` user, with a health check on `/api/health`) and starts it with `compose.yaml` on port 8180.

**The image is rebuilt on every `pnpm docker`, skipping what did not change.** The pnpm store is a BuildKit cache (packages are never downloaded twice), and `.dockerignore` leaves out of the build context everything the build does not read: documentation, tests, migrations, the brand's source artwork, `*.md`, and the Dockerfile, `compose.yaml` and `Makefile` themselves. Editing any of them does not invalidate the image's `pnpm install` and `pnpm build` steps, so the next `pnpm docker` reuses the image; a change to the code or the dependencies rebuilds them. The pnpm the image installs and its Node major are pinned in the Dockerfile; a unit test checks they agree with `packageManager` and `.nvmrc` (`test/unit/config/tool-versions.test.ts`).

Inside a container `127.0.0.1` is the container itself, so the app reaches Supabase through `host.docker.internal`. The browser uses the same URLs (including the presigned audio URLs), so the host must resolve that name too: Docker Desktop on Windows adds it to the hosts file, on macOS it has to be added once by hand (see [Troubleshooting](16-troubleshooting.md#16-troubleshooting)). The script writes them to `.env.docker`.

## 11.4 Local services

| Service | URL |
|---|---|
| App (dev) · App (Docker) | http://localhost:3100 · http://localhost:8180 |
| Supabase API | http://127.0.0.1:54321 |
| Supabase Studio (tables, users, files, SQL editor) | http://127.0.0.1:54323 |
| Mailpit (emails sent by local Auth) | http://127.0.0.1:54324 |
| Postgres (direct) | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |

`pnpm db:status` prints all URLs and keys.

The app's ports are the common defaults plus 100, so they do not collide with other local projects that keep 3000 or 8080: **3100** dev, **8180** Docker, **3200** e2e. To change one, update every place it is written:

| Port | Where |
|---|---|
| 3100 (dev, and `pnpm preview`) | `package.json` (`dev` and `preview` scripts, `--port`), `supabase/config.toml` (`site_url`, `additional_redirect_urls`), `playwright.config.ts` (`E2E_DEV=1`), `scripts/stack.mjs` (start-up message), `scripts/check-r2.mjs` (default origin), the R2 CORS policy ([13.2](13-deployment.md#132-cloudflare-r2-audio-files)) |
| 8180 (Docker) | `compose.yaml` (`ports`), `scripts/stack.mjs` (`DOCKER_APP_URL`) |
| 3200 (e2e) | `playwright.config.ts`, `supabase/config.toml` (`additional_redirect_urls`: the reset email's link, followed by `password-reset.spec.ts`) |

Plus the `Makefile` help texts, the README and these docs. The dev port goes on the command line, not in `devServer.port` in `nuxt.config.ts`: the Nuxt test environment reads that config too, and a fixed port there makes the component test suites time out when they run in parallel. Inside the app container Nuxt still listens on 3000 (`Dockerfile`); only the host side changes.

## 11.5 Local data

- Data survives `pnpm stop` and restarts: it lives in Docker volumes.
- The **demo user** (`demo@chronovault.local` / `chronovault`) is created by `supabase/seed.sql` when the database is first created or reset.
- **New migrations: `pnpm db:migrate`** (or `make db-migrate`) applies them and keeps every account and track. `pnpm db:reset` rebuilds the database from scratch and **deletes all local data** — use it only when you mean it.
- Local and production data are separate (see [5.3](05-architecture.md#53-where-everything-runs)).
- **Emails** the local Auth sends (sign-up confirmation when turned on, "Forgot password?") land in Mailpit (11.4), never in a real inbox. The reset email's text is in `supabase/templates/recovery.html`; Auth reads it, like the rest of `supabase/config.toml`, only when Supabase starts: after changing either, `pnpm stop` then `pnpm local`.

## 11.6 Updating dependencies

1. On a branch: `pnpm outdated` lists what is behind; `pnpm update` moves every package to the newest version its range in `package.json` allows, indirect dependencies included. That is the safe step: no major version changes.
2. Then `pnpm check`, and the end-to-end tests on a production build (`pnpm test:e2e`): the waveform (wavesurfer.js), tag reading (music-metadata) and the PWA are only really exercised there.
3. Major versions one at a time, each with the same checks.

**Security advisories: `pnpm audit`** checks the lockfile against the advisory database.

- **When it runs:** `.github/workflows/audit.yml` runs it on GitHub every Monday at 06:00 UTC, on every push, to any branch, that changes `package.json`, `pnpm-lock.yaml` or `pnpm-workspace.yaml`, and by hand from the Actions tab. The branch's own push counts: a vulnerable version added on a branch fails its run there, next to the CI, before it can reach production. The pull request `pnpm merge:main` opens reads that run, so a failed audit stops the script and nothing is merged; a pull request from a fork, whose branch is not pushed here, is audited on its own (`pull_request`), while one from a branch here skips that second run.
- **When it fails:** a new advisory fails the run, and GitHub emails you about a failed scheduled run; its job summary also lists the outdated packages. Then, on a branch: `pnpm update` when the fix is within the ranges (an indirect dependency included, e.g. `pnpm update serialize-javascript`), or a version change as in steps 1–3.
- **When no fix is within reach** and the issue cannot be exploited here, list the advisory under `auditConfig.ignoreGhsas` in `pnpm-workspace.yaml` with its reason and the condition to remove it, and dismiss its Dependabot alert (*Security → Dependabot*) with the same reason, as "Vulnerable code is not actually used" or "Risk is tolerable", so the repository and GitHub tell the same story. These three are left out today:

| Advisory | Package | Why it is left out | Remove when |
|---|---|---|---|
| GHSA-3g3m-2fjr-6pw4 (moderate) | `glob` 10, 11 and 13, via `archiver-utils`, `workbox-build`, `@vercel/nft`, `js-beautify` | Build and test tools walking the project's own files, with no abort signal; fixed in `glob` 14 only, and every one of them is at its latest | they move to `glob` ≥14.0.2 |
| GHSA-g3hv-75wg-m249 (moderate) | `minimatch` 5, 9 and 10, via ESLint, `glob`, `filelist`, `readdir-glob` | Lint and build tools matching the project's own patterns, never a user's; fixed in `minimatch` 11 only | they move to `minimatch` ≥11.0.1 |
| GHSA-g7r4-m6w7-qqqr (low) | `esbuild` 0.27, via `@nuxt/ui` → `@nuxt/fonts` 0.14 → `fontless` 0.2 | The flaw is in esbuild's own dev server on Windows; fontless only calls `transform`, at build time | `@nuxt/ui` moves to `@nuxt/fonts` 1.x |

None of these packages reaches the production build (`.output`).

**Dependabot alongside the audit.** GitHub's dependency graph reads `pnpm-lock.yaml`, so Dependabot raises an alert for each advisory that touches an npm package and, when a fixed release exists, opens a pull request with it (security updates, [13.8](13-deployment.md#138-the-github-repository)). The audit stays the check that blocks: it fails the branch that brings an advisory in, before the merge, and the advisories left out are kept in the repository with their reason (the table above), where a dismissed alert's reason lives on GitHub only. Version updates by Dependabot (`.github/dependabot.yml`) cover the GitHub Actions only, those of the workflows and those of the setup they share (`.github/actions/setup`): one grouped pull request a week, checked by CI. The actions are pinned to a commit hash with the release in a comment (`@<sha> # v7.0.1`), and the pull request moves both. npm updates stay manual, as above.

**Versions younger than a day are not installed.** pnpm 12 has a supply-chain protection on by default (`minimumReleaseAge`, 24 hours): a compromised release is usually found and pulled within hours, so pnpm waits. A new release (e.g. of the Supabase CLI, which announces itself in the terminal) is simply skipped by `pnpm update` until it is a day old. Asking for it by name (`pnpm add -D pkg@x.y.z`) installs it anyway, but pnpm then writes a `minimumReleaseAgeExclude` list into `pnpm-workspace.yaml`: do not commit it, wait a day instead.

**Peer warnings accepted on purpose** (`peerDependencyRules` in `pnpm-workspace.yaml`, so `pnpm install` stays quiet): `@vercel/analytics` 2.0.1, the latest stable, declares `vue-router ^4`, while Nuxt 4 brings vue-router 5. The part the app uses (`injectAnalytics`) only calls Nuxt's router (`useRouter`, `useRoute`, `afterEach`), unchanged in 5, and Vercel's own 2.1 betas already accept `^4 || ^5`; whether page views are counted can only be seen on the Vercel deployment ([7.16](07-data-flows.md#716-statistics)). When a stable `@vercel/analytics` declares vue-router 5, update it and remove the rule. `pnpm peers check` lists any other mismatch (today: "No peer dependency issues found").

**Major versions held back on purpose** (as of October 2026):

| Package | Stays on | Why |
|---|---|---|
| `typescript` | 6 (`~6.0.3`) | TypeScript 7, the native rewrite, drops the internal files tools load: `vue-tsc` (3.3) fails with `ERR_PACKAGE_PATH_NOT_EXPORTED` (`typescript/lib/tsc`), so `pnpm typecheck` cannot run. Move when `vue-tsc` supports it |
| `h3` | 1 | Nitro, Nuxt 4's server, runs on h3 1 (`^1.15.11`) and the server code uses its helpers (`createError`, `H3Event`); an h3 2 copy next to it would make errors Nitro does not recognise (500s). Move with Nuxt |

## 11.7 The README's screenshots

The screenshots in `docs/screenshots/` are taken from the local stack, signed in as the seeded demo user with tracks whose rights the project holds uploaded to it; never from production, and never showing another account.

1. `pnpm local`; `pnpm db:migrate` first if a pull brought new migrations.
2. Playwright (a dev dependency) driving Chromium: phone screens at 390 × 844, desktop at 1440 × 900, `deviceScaleFactor: 2`, `colorScheme: 'dark'`, `locale: 'en-US'`; a track playing for a few seconds, so the waveform shows progress.
3. Hide the Nuxt DevTools, which only development shows: a style `#nuxt-devtools-container, nuxt-devtools-inspect-panel, #vue-tracer-overlay { display: none }` added by `context.addInitScript()`.
4. Screens dominated by cover art as JPEG (`type: 'jpeg', quality: 85`): a PNG of them weighs four times as much.

---

← [10. Configuration](10-configuration.md) · [Contents](../README.md#documentation) · [12. Testing](12-testing.md) →
