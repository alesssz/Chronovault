# 11. Local development in detail

## 11.1 Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | **24.11+** (or 22.21+) | `.nvmrc` pins 24; older versions make Nuxt print a warning |
| pnpm | 12 | `npm i -g pnpm@12.14.0` (pinned in `packageManager`); `corepack enable` also works where Node ships Corepack (Homebrew's Node does not) |
| Docker Desktop | recent | Runs the local Supabase stack (and the app in Docker mode) |
| GNU Make | optional | macOS: comes with `xcode-select --install`. Windows: `winget install ezwinports.make` (not part of Git for Windows). Every target has a `pnpm` equivalent |
| Playwright's Chromium | for e2e tests only | Not your own Chrome: Playwright downloads its own (~150 MB, in `~/Library/Caches/ms-playwright` on macOS). `make test-e2e` installs it when missing |

### From a blank computer

Everything a new computer needs, in order, for **macOS** and **Windows**. Each step says why: every one of them is a problem that really happened.

**Start here, on any system:** once Git and any Node are installed, clone the project and run

```bash
node scripts/doctor.mjs     # later also: pnpm doctor · make doctor
```

It checks Node, pnpm, Docker, the dependencies, `host.docker.internal`, Playwright's Chromium, Make and the local stack, and prints the command that fixes each missing item for the system you are on. It only reads: nothing is installed or changed. Run it again after each step until it says **Ready**.

#### macOS

1. **Homebrew** (https://brew.sh), **Git** (`xcode-select --install`, which also brings GNU Make) and **Docker Desktop** (https://www.docker.com/products/docker-desktop/). Open Docker Desktop once and wait until the engine says it is running.
2. **Node 24 through nvm**, not Homebrew's `node`. Homebrew may ship an older Node (e.g. 22.9): with it `pnpm install` silently skips a native package (rolldown requires Node ≥ 22.12), and the build and tests then fail with `Cannot find native binding`. nvm also leaves other projects on their own Node.
   ```bash
   brew install nvm
   mkdir -p ~/.nvm
   cat >> ~/.zshrc <<'ZSH'

   # nvm (Node Version Manager)
   export NVM_DIR="$HOME/.nvm"
   [ -s "/opt/homebrew/opt/nvm/nvm.sh" ] && \. "/opt/homebrew/opt/nvm/nvm.sh"
   ZSH
   source ~/.zshrc
   cd <path>/Chronovault
   nvm install          # reads .nvmrc → Node 24
   nvm use
   ```
   - The first Node installed with nvm becomes the default in every new terminal. To keep Homebrew's Node as the default for other projects: `nvm alias default system`, then `nvm use` inside this folder.
   - Brew's notes also suggest a `bash_completion` line: leave it out, it is meant for bash.
   - If `source ~/.zshrc` prints `command not found: compdef`, another tool's completion (e.g. Angular CLI's `source <(ng completion script)`) runs before zsh's completion system: put `autoload -Uz compinit && compinit` on the line before it.
3. **pnpm**, installed for that Node (with nvm, global packages belong to one Node version):
   ```bash
   npm i -g pnpm@12.14.0 --allow-scripts=pnpm
   node -v && pnpm -v   # v24.x and 12.14.0
   ```
   Recent npm versions skip install scripts unless allowed. Without `--allow-scripts=pnpm` you only get a warning, and pnpm still works through Node instead of its native binary (marginally slower).
4. **Dependencies and the local stack.** The first run downloads the Supabase Docker images (a few GB, several minutes):
   ```bash
   pnpm install
   make local           # → http://localhost:3100
   ```
5. **Docker mode only** (`make docker`, http://localhost:8180): the browser must resolve `host.docker.internal`, and Docker Desktop for Mac never adds it to the hosts file (its setting exists only on Windows). Once per machine, with your password:
   ```bash
   echo "127.0.0.1 host.docker.internal" | sudo tee -a /etc/hosts
   ```
   Without it, sign-in fails with `ERR_NAME_NOT_RESOLVED`. `make local` does not need it.
6. **End-to-end tests:** `make test-e2e`. The first time it downloads Playwright's own Chromium (~150 MB, in `~/Library/Caches/ms-playwright`).

#### Windows (10/11)

Use **PowerShell** for the installs and **Git Bash** for the project commands: the Makefile and the npm scripts expect a POSIX shell. The repository forces LF line endings (`.gitattributes`), so the scripts, the Makefile and the SQL files keep working after a Windows checkout.

1. **Git and Docker Desktop**, from PowerShell:
   ```powershell
   winget install Git.Git
   winget install Docker.DockerDesktop     # uses WSL 2; restart Windows when asked
   ```
   Open Docker Desktop once and wait until the engine says it is running. If it asks to install or update WSL, accept, or run `wsl --update` in an administrator PowerShell.
2. **Node 24 through nvm-windows.** First remove any Node already installed from *Settings → Apps*: nvm-windows cannot manage it, and the two would conflict. Then:
   ```powershell
   winget install CoreyButler.NVMforWindows
   # close and reopen the terminal, then:
   nvm install 24
   nvm use 24          # needs an administrator terminal (or Windows Developer Mode)
   ```
   nvm-windows does not read `.nvmrc`: the version is given explicitly. `nvm use` switches Node for every terminal and every project.
3. **pnpm**, from Git Bash or PowerShell:
   ```bash
   npm i -g pnpm@12.14.0 --allow-scripts=pnpm
   node -v && pnpm -v   # v24.x and 12.14.0
   ```
4. **GNU Make** (optional: every `make` target has a `pnpm` equivalent). The standard Git for Windows does not include it:
   ```powershell
   winget install ezwinports.make           # then reopen Git Bash
   ```
5. **Dependencies and the local stack**, from Git Bash. The first run downloads the Supabase Docker images (a few GB, several minutes):
   ```bash
   pnpm install
   pnpm local           # or make local → http://localhost:3100
   ```
   pnpm keeps its store inside the project (`.pnpm-store/`): hard links only work within one drive, so it never creates a store at the root of your drive.
6. **Docker mode only** (`pnpm docker`, http://localhost:8180): the browser must resolve `host.docker.internal`. Docker Desktop for Windows adds it to the hosts file when *Settings → General → "Add the \*.docker.internal names to the host's /etc/hosts file"* is on (the default). Check with `ping host.docker.internal`. If it does not answer, turn the setting on, or open Notepad **as administrator** and add this line at the end of `C:\Windows\System32\drivers\etc\hosts`:
   ```
   127.0.0.1 host.docker.internal
   ```
7. **End-to-end tests:** `make test-e2e` (or `pnpm exec playwright install chromium`, then `pnpm test:e2e`). Playwright's Chromium goes to `%LOCALAPPDATA%\ms-playwright`.
8. If `git commit` fails with "Permission denied", an antivirus is locking files in `.git`: add the project folder to its exclusions.

The Supabase CLI is a dev dependency: no global install needed. pnpm keeps its package store in the project (`.pnpm-store/`, git-ignored, see `pnpm-workspace.yaml`); `node_modules` holds hard links to it, so the space is not used twice even if Explorer counts it twice.

### Updating a computer set up before the port change

The app used to answer on **3000** (dev), **8080** (Docker) and **3100** (e2e); it now uses **3100**, **8180** and **3200** ([11.4](#114-local-services)). A computer that ran the old ports needs these steps once. The commands are the same on **macOS** (Terminal) and **Windows** (Git Bash), run in the project folder; where the two differ, both are given.

The port change itself loses no data: accounts, tracks, playlists and audio files live in Supabase's Docker volumes, named after the Supabase project, not after any port. What can leave them behind is the project's earlier rename from `chronoplayer` to `chronovault`: step 3 finds out and moves them.

1. **Stop everything, before pulling:**
   ```bash
   pnpm stop
   ```
   The Supabase ports did not change, so a stack left running would be reused as it is, with Auth still on the old `site_url`: `supabase/config.toml` is read only when Supabase starts. `pnpm stop` also removes the Docker-mode app container, still published on 8080. Data is kept.
2. **Update the code and the dependencies:**
   ```bash
   git switch main && git pull
   pnpm install
   ```
3. **The project's old name: stack and data.** Before the rename the Supabase project was `chronoplayer`, and its stack used volumes of its own: `supabase_db_chronoplayer` (the database) and `supabase_storage_chronoplayer` (audio files and covers). The `chronovault` stack does not see them.
   1. **Stop the old stack, if it is still there.** Its containers hold the same ports, and `pnpm local` would fail with `Bind for 0.0.0.0:54322 failed: port is already allocated`.
      ```bash
      docker ps -a --format "{{.Names}}" | grep chronoplayer
      ```
      If it prints anything:
      ```bash
      pnpm exec supabase stop --project-id chronoplayer
      ```
      This keeps the volumes.
   2. **Find where the data is.** List the Supabase volumes with their size:
      ```bash
      docker system df -v | grep -E "^supabase_(db|storage)_"
      ```
      A database nobody used is about 70 MB, with an empty storage volume (0 B). The volumes with your tracks are the ones whose storage holds hundreds of MB or more.
      - **No `chronoplayer` volumes**, or nothing in them you need: the data is already in the `chronovault` volumes, or there is none. Go to step 4.
      - **The data is in the `chronoplayer` volumes, and `chronovault` has nothing you need** (missing, or a fresh database): copy it across, step 3.3.
      - **Both hold data you need**: stop here. The copy replaces the target, and merging two databases is not covered by these steps.
   3. **Copy the data into the `chronovault` volumes.** Both stacks must be stopped (step 1 and step 3.1). For each volume the command empties the `chronovault` one, then copies the `chronoplayer` one into it with owners and permissions, which Postgres needs. The source is mounted read-only (`:ro`) and stays untouched, so the copy can be repeated.
      ```bash
      pnpm db:start && pnpm db:stop    # creates the chronovault volumes, if missing, the way Supabase labels them
      for v in db storage; do
        MSYS_NO_PATHCONV=1 docker run --rm \
          -v supabase_${v}_chronoplayer:/from:ro \
          -v supabase_${v}_chronovault:/to \
          alpine sh -c 'find /to -mindepth 1 -delete && cp -a /from/. /to/'
      done
      ```
      `MSYS_NO_PATHCONV=1` is for Git Bash on Windows, which would otherwise rewrite `/from` and `/to` as Windows paths. On macOS it does nothing. Starting and stopping Supabase first matters: a volume that `docker run` creates has no Supabase labels, and `supabase stop --no-backup` (below) would not find it.

      Then check, in step 5, that the tracks are there and play. If Supabase does not start, the old volumes are unchanged: `pnpm exec supabase stop --no-backup` deletes the `chronovault` volumes, and `pnpm local` starts afresh.
4. **Free port 3100.** It used to be the e2e port: a production server left running by `make test-e2e` would still hold it, and Nuxt would then quietly start on another port, where sign-in redirects do not work.
   - **macOS:** `lsof -nP -iTCP:3100 -sTCP:LISTEN` lists it; stop it with `kill <PID>`.
   - **Windows:** `netstat -ano | findstr :3100` gives its PID (last column); stop it with `taskkill /PID <PID> /F`.
5. **Start:**
   ```bash
   pnpm local           # → http://localhost:3100
   ```
   `.env` holds no app port, and `pnpm local` rewrites it anyway. Docker mode: `pnpm docker` → http://localhost:8180.

   If you copied the data in step 3.3, check it now: sign in with your own account, open the library, play a track and look at a cover. Supabase Studio (http://127.0.0.1:54323) → *Table Editor* → `tracks` shows the rows too.
6. **In the browser:**
   - Update bookmarks: `localhost:3000` → `localhost:3100`, `localhost:8080` → `localhost:8180`.
   - What the app keeps in `localStorage` is tied to the port, so on the new address it starts afresh: play queue, volume, shuffle and repeat, lyrics view. The session is a cookie, which ignores the port: you stay signed in if the database is the same one, otherwise sign in again.
   - If you installed the PWA from the old address, uninstall it (Chrome or Edge: open the installed app → **⋮** → *Uninstall*) and install it again from http://localhost:3100.
   - Clear the old addresses, so their service worker cannot serve stale Chronovault files to another project that now uses 3000 or 8080: open http://localhost:3000 (and :8080) → DevTools → *Application* → *Storage* → **Clear site data**. Or, in Chrome or Edge, `chrome://serviceworker-internals` (`edge://serviceworker-internals`) → *Unregister* next to those addresses.
7. **R2 (only if local development uses R2):** add `"http://localhost:3100"` to `AllowedOrigins` in the bucket's CORS policy ([13.2](13-deployment.md#132-cloudflare-r2-audio-files)), then `pnpm r2:check`. The bucket is shared: once is enough for every computer.
8. **Delete the old volumes, last.** Only once step 5 showed your tracks in the new stack, or you know nothing in the old volumes is needed. There is no way back:
   ```bash
   docker volume rm supabase_db_chronoplayer supabase_storage_chronoplayer
   ```

Nothing else changes: the hosts-file entry for `host.docker.internal`, Node, pnpm and Docker stay as they are.

## 11.2 Step by step (what `pnpm local` automates)

```bash
pnpm install
pnpm db:start        # first time: pulls the Supabase Docker images (a few minutes)
pnpm env:local       # writes .env from `supabase status`
pnpm db:types        # optional: regenerate database types
pnpm dev             # http://localhost:3100
```

or `make setup` followed by `make dev`.

## 11.3 How the Docker mode works

Supabase always runs in the containers managed by the Supabase CLI. `pnpm docker` builds the app image from the `Dockerfile` (multi-stage: dependencies and build in the first stage, only the self-contained `.output/` in the final `node:24-alpine` image, run as the unprivileged `node` user, with a health check on `/api/health`) and starts it with `compose.yaml` on port 8180.

**Rebuilds skip what did not change.** The pnpm store is a BuildKit cache (packages are never downloaded twice), and `.dockerignore` leaves out of the build context everything the build does not read: documentation, tests, migrations, the brand's source artwork, `*.md`, and the Dockerfile, `compose.yaml` and `Makefile` themselves. Editing any of them no longer invalidates the image's `pnpm install` and `pnpm build` steps, so the next `pnpm docker` reuses the image as it was; a change to the code or the dependencies rebuilds as before. The pnpm the image installs and its Node major are pinned in the Dockerfile; a unit test checks they agree with `packageManager` and `.nvmrc` (`test/unit/config/tool-versions.test.ts`).

Inside a container `127.0.0.1` is the container itself, so the app reaches Supabase through `host.docker.internal`. The browser uses the same URLs (including the presigned audio URLs), so the host must resolve that name too: Docker Desktop on Windows adds it to the hosts file, on macOS it has to be added once by hand (see [Troubleshooting](16-troubleshooting.md#16-troubleshooting)). The script writes them to `.env.docker`. The image is rebuilt on every `pnpm docker` (the pnpm store is a build cache, so rebuilds are fast).

## 11.4 Local services

| Service | URL |
|---|---|
| App (dev) · App (Docker) | http://localhost:3100 · http://localhost:8180 |
| Supabase API | http://127.0.0.1:54321 |
| Supabase Studio (tables, users, files, SQL editor) | http://127.0.0.1:54323 |
| Mailpit (emails sent by local Auth) | http://127.0.0.1:54324 |
| Postgres (direct) | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |

`pnpm db:status` prints all URLs and keys.

The app's ports are the common defaults plus 100, so they do not collide with other local projects that keep 3000 or 8080: **3100** dev (was 3000), **8180** Docker (was 8080), **3200** e2e (was 3100). A computer that ran the old ones: see [Updating a computer set up before the port change](#updating-a-computer-set-up-before-the-port-change). To change one, update every place it is written:

| Port | Where |
|---|---|
| 3100 (dev, and `pnpm preview`) | `package.json` (`dev` and `preview` scripts, `--port`), `supabase/config.toml` (`site_url`, `additional_redirect_urls`), `playwright.config.ts` (`E2E_DEV=1`), `scripts/stack.mjs` (start-up message), `scripts/check-r2.mjs` (default origin), the R2 CORS policy ([13.2](13-deployment.md#132-cloudflare-r2-audio-files)) |
| 8180 (Docker) | `compose.yaml` (`ports`), `scripts/stack.mjs` (`DOCKER_APP_URL`) |
| 3200 (e2e) | `playwright.config.ts` |

Plus the `Makefile` help texts, the README and these docs. The dev port goes on the command line, not in `devServer.port` in `nuxt.config.ts`: the Nuxt test environment reads that config too, and a fixed port there makes the component test suites time out when they run in parallel. Inside the app container Nuxt still listens on 3000 (`Dockerfile`); only the host side changes.

## 11.5 Local data

- Data survives `pnpm stop` and restarts: it lives in Docker volumes.
- The **demo user** (`demo@chronovault.local` / `chronovault`) is created by `supabase/seed.sql` when the database is first created or reset.
- **New migrations: `pnpm db:migrate`** (or `make db-migrate`) applies them and keeps every account and track. `pnpm db:reset` rebuilds the database from scratch and **deletes all local data** — use it only when you mean it.
- Local and production data are separate (see [5.3](05-architecture.md#53-where-everything-runs)).

## 11.6 Updating dependencies

1. On a branch: `pnpm outdated` lists what is behind; `pnpm update` moves every package to the newest version its range in `package.json` allows, indirect dependencies included. That is the safe step: no major version changes.
2. Then `pnpm check`, and the end-to-end tests on a production build (`pnpm test:e2e`): the waveform (wavesurfer.js), tag reading (music-metadata) and the PWA are only really exercised there.
3. Major versions one at a time, each with the same checks.

**Security advisories: `pnpm audit`.** It checks the lockfile against the advisory database, and `.github/workflows/audit.yml` runs it on GitHub every Monday at 06:00 UTC and on every push, to any branch, that changes `package.json`, `pnpm-lock.yaml` or `pnpm-workspace.yaml` (also by hand, from the Actions tab). The branch's own push counts: branches are merged locally, never through a pull request, and the push to `main` deploys, so a vulnerable version added on a branch fails its run there, next to the CI, before the merge (audited on `main` only, it was reported once already in production). A new advisory fails the run, and GitHub emails you about a failed scheduled run; its job summary also lists the outdated packages. Then, on a branch: `pnpm update` when the fix is within the ranges (an indirect dependency included, e.g. `pnpm update serialize-javascript`), or a version change as in steps 1–3. When no fix is within reach and the issue cannot be exploited here, list the advisory under `auditConfig.ignoreGhsas` in `pnpm-workspace.yaml` with its reason and the condition to remove it, as for the four there now:

| Advisory | Package | Why it is left out | Remove when |
|---|---|---|---|
| GHSA-3g3m-2fjr-6pw4 (moderate) | `glob` 10, 11 and 13, via `archiver-utils`, `workbox-build`, `@vercel/nft`, `js-beautify` | Build and test tools walking the project's own files, with no abort signal; fixed in `glob` 14 only, and every one of them is at its latest | they move to `glob` ≥14.0.2 |
| GHSA-g3hv-75wg-m249 (moderate) | `minimatch` 5, 9 and 10, via ESLint, `glob`, `filelist`, `readdir-glob` | Lint and build tools matching the project's own patterns, never a user's; fixed in `minimatch` 11 only | they move to `minimatch` ≥11.0.1 |
| GHSA-gcqx-w48m-w2h4 (low) | `deepmerge` ≤4.3.1, via `@rollup/plugin-node-resolve` | Nitro's build merges its own options from the build config; no fixed release exists | `deepmerge` publishes a fix |
| GHSA-g7r4-m6w7-qqqr (low) | `esbuild` 0.27, via `@nuxt/ui` → `@nuxt/fonts` 0.14 → `fontless` 0.2 | The flaw is in esbuild's own dev server on Windows; fontless only calls `transform`, at build time | `@nuxt/ui` moves to `@nuxt/fonts` 1.x |

None of these packages reaches the production build (`.output`).

**Why not GitHub's Dependabot alerts:** GitHub's dependency graph does not read pnpm 12 lockfiles made of two YAML documents (ours: the pnpm version first, then the packages), so it sees no npm dependency and raises no alert, and Dependabot could not open npm updates either. It is set up (`.github/dependabot.yml`) for the GitHub Actions of the workflows only: one grouped pull request a week, checked by CI. npm updates stay manual, as above.

**Versions younger than a day are not installed.** pnpm 12 has a supply-chain protection on by default (`minimumReleaseAge`, 24 hours): a compromised release is usually found and pulled within hours, so pnpm waits. A new release (e.g. of the Supabase CLI, which announces itself in the terminal) is simply skipped by `pnpm update` until it is a day old. Asking for it by name (`pnpm add -D pkg@x.y.z`) installs it anyway, but pnpm then writes a `minimumReleaseAgeExclude` list into `pnpm-workspace.yaml`: do not commit it, wait a day instead.

**Peer warnings accepted on purpose** (`peerDependencyRules` in `pnpm-workspace.yaml`, so `pnpm install` stays quiet): `@vercel/analytics` 2.0.1, the latest stable, declares `vue-router ^4`, while Nuxt 4 brings vue-router 5. The part the app uses (`injectAnalytics`) only calls Nuxt's router (`useRouter`, `useRoute`, `afterEach`), unchanged in 5, and Vercel's own 2.1 betas already accept `^4 || ^5`. When a stable `@vercel/analytics` declares vue-router 5, update it and remove the rule; `pnpm peers check` lists any other mismatch.

**Major versions held back on purpose** (as of October 2026):

| Package | Stays on | Why |
|---|---|---|
| `typescript` | 6 (`~6.0.3`) | TypeScript 7, the native rewrite, drops the internal files tools load: `vue-tsc` (3.3) fails with `ERR_PACKAGE_PATH_NOT_EXPORTED` (`typescript/lib/tsc`), so `pnpm typecheck` cannot run. Move when `vue-tsc` supports it |
| `h3` | 1 | Nitro, Nuxt 4's server, runs on h3 1 (`^1.15.11`) and the server code uses its helpers (`createError`, `H3Event`); an h3 2 copy next to it would make errors Nitro does not recognise (500s). Move with Nuxt |

`pnpm peers check` reports one known mismatch, older than these notes: `@vercel/analytics` declares `vue-router` 4 while the app uses 5. It does not stop the install, the build or the tests; whether page views are counted can only be seen on the Vercel deployment ([7.16](07-data-flows.md#716-statistics)).

---

← [10. Configuration](10-configuration.md) · [Contents](../README.md#documentation) · [12. Testing](12-testing.md) →
