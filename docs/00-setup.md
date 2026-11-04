# 0. Setup

Everything from a blank computer to Chronovault running locally, then how to stop it, start it again, keep it up to date and wipe it. Once it runs, [2. Quick start](02-quick-start.md) is the everyday cheat sheet; [11](11-local-development.md#11-local-development-in-detail) has the details behind each step. Putting the app online (Supabase Cloud, Cloudflare R2, Vercel) is [13](13-deployment.md#13-deployment-supabase--cloudflare-r2--vercel).

Locally the whole app runs on your computer: Supabase (database, sign-in, files) in Docker, the app with Node. No account on any online service is needed, and nothing local touches production ([5.3](05-architecture.md#53-where-everything-runs)).

## 0.1 What you need

| Tool | Version | Notes |
|---|---|---|
| Git | any recent | To get the code |
| Node.js | **24** (24.11+, or 22.21+) | Through nvm: `.nvmrc` pins 24 |
| pnpm | **12.14.0** | Pinned in `package.json` (`packageManager`) |
| Docker Desktop | recent, **running** | Runs the local Supabase stack (and the app, in Docker mode) |
| GNU Make | optional | Every `make` target has a `pnpm` equivalent |

About 10 GB free: the Supabase Docker images take about 6 GB, the dependencies about 1.5 GB (`node_modules` holds hard links into the pnpm store, so the space is not used twice even if a file manager counts it twice), Playwright's Chromium (for the end-to-end tests only) about 150 MB.

**Not sure what is missing?** Once Git and any Node are there, clone the project (0.3) and run, in its folder:

```bash
node scripts/doctor.mjs     # later also: pnpm doctor · make doctor
```

It checks Node, pnpm, Docker, the dependencies, `host.docker.internal`, Playwright's Chromium, Make and the local stack, and prints the command that fixes each missing item for the system you are on. It only reads: nothing is installed or changed. Run it again after each step until it says **Ready**.

## 0.2 From a blank computer

Every tool, in order, for **macOS** and **Windows**. Each step says why: every one of them is a problem that really happened.

### macOS

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
   cd <path>/Chronovault  # once cloned (0.3)
   nvm install            # reads .nvmrc → Node 24
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

### Windows (10/11)

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
5. If `git commit` fails with "Permission denied", an antivirus is locking files in `.git`: add the project folder to its exclusions.

The Supabase CLI is a dev dependency: no global install, on either system.

## 0.3 Getting the code

```bash
git clone https://github.com/alesssz/Chronovault.git
cd Chronovault
```

**Set who your commits are from, before the first one.** The repository is public, so every commit shows its author's email, and Vercel refuses to deploy a commit whose author is not on the GitHub account ([16](16-troubleshooting.md#16-troubleshooting)). On a computer whose global git identity is another one (a work laptop), give this repository its own, with the private address GitHub offers under *Settings → Emails* (`<id>+<user>@users.noreply.github.com`):

```bash
git config user.name "<your name>"
git config user.email "<id>+<user>@users.noreply.github.com"
git config user.email      # check: prints that address
```

Without `--global` it is stored in `.git/config` and applies to this clone only. A new clone starts without it.

**A clone made before 3 November 2026** cannot be updated: the history was rewritten that day (the authors' email addresses) and published as a new repository under the same address, so `git pull` fails with `refusing to merge unrelated histories`. Copy anything not pushed out of it (and `.env.r2`, if you made one), delete the folder and clone again. Local accounts and tracks are not in the folder but in Docker volumes named after the Supabase project, so the new clone finds them.

## 0.4 First start

Docker Desktop must be open and running. Then, in the project folder (Git Bash on Windows):

```bash
pnpm install     # dependencies; the package store goes to .pnpm-store/, inside the project
pnpm local       # or: make local
```

`pnpm local` checks Docker, starts Supabase, writes `.env` from it and runs the Nuxt dev server in the foreground ([3.1](03-commands.md#31-the-whole-stack-in-one-command)). **The first time** it downloads the Supabase images (about 6 GB, several minutes) and creates the database from the migrations and `supabase/seed.sql`. The app is ready when the terminal shows `Local: http://localhost:3100/`.

Open **http://localhost:3100** and sign in with the demo account **`demo@chronovault.local` / `chronovault`**, or create one: email confirmation is off locally, and any email the local Auth sends lands in Mailpit (0.5). The first page takes a while: Vite compiles the dependencies on the first request.

Uploaded audio goes to the local Supabase Storage (bucket `audio`), not to R2: local development needs no Cloudflare account.

## 0.5 Addresses

| What | Address |
|---|---|
| **The app** (`pnpm local`, with hot reload) | http://localhost:3100 |
| **The app in Docker** (`pnpm docker`, production build) | http://localhost:8180 |
| Supabase Studio: tables, users, files, SQL editor | http://127.0.0.1:54323 |
| Mailpit: emails sent by the local Auth | http://127.0.0.1:54324 |
| Supabase API (what the app talks to) | http://127.0.0.1:54321 |
| Postgres, directly | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| Health check | http://localhost:3100/api/health |

`pnpm db:status` prints the Supabase addresses and keys. Why these ports, and how to change one: [11.4](11-local-development.md#114-local-services).

## 0.6 Stopping and starting again

| To… | Do |
|---|---|
| Stop the app only | <kbd>Ctrl</kbd>+<kbd>C</kbd> in the terminal of `pnpm local`. Supabase keeps running, so the next `pnpm local` starts in seconds |
| Stop everything | `pnpm stop` (or `make stop`): removes the Docker-mode app container and stops Supabase. **Data is kept** |
| Start again | `pnpm local`: it starts Supabase when it is not running, and writes `.env` again |
| After a restart of the computer | Open Docker Desktop, wait until it runs, then `pnpm local` |
| Free the memory of Docker | `pnpm stop`, then quit Docker Desktop |

Accounts, tracks, playlists and files live in Docker volumes: they survive `pnpm stop`, quitting Docker Desktop and restarting the computer. Only 0.8 deletes them.

### Docker mode

`pnpm docker` (or `make docker`) runs the **production build** in a container, the way Vercel runs it, against the same local Supabase (same accounts and tracks): useful to check the PWA, the service worker and the Content Security Policy, which the dev server leaves out. No hot reload: run it again after a change (the image is rebuilt; unchanged steps come from the cache).

```bash
pnpm docker          # builds and starts in the background → http://localhost:8180
make docker-logs     # follow the app's logs (Ctrl+C stops following, not the app)
pnpm stop            # stops the container and Supabase
```

**Once per computer, macOS only:** the browser must resolve `host.docker.internal`, which Docker Desktop for Mac never adds to the hosts file (Docker Desktop for Windows does, when *Settings → General → "Add the \*.docker.internal names to the host's /etc/hosts file"* is on, the default):

```bash
echo "127.0.0.1 host.docker.internal" | sudo tee -a /etc/hosts
```

Without it, sign-in fails with `ERR_NAME_NOT_RESOLVED`. On Windows, check with `ping host.docker.internal`; if it does not answer, turn the setting on, or add the line `127.0.0.1 host.docker.internal` at the end of `C:\Windows\System32\drivers\etc\hosts` with Notepad run as administrator. `pnpm local` needs none of this.

## 0.7 After pulling new code

```bash
git switch main && git pull
pnpm install         # when package.json or pnpm-lock.yaml changed (harmless otherwise)
pnpm db:migrate      # when supabase/migrations/ has new files: applies them, keeping your data
pnpm local
```

`pnpm local` does not apply new migrations to a database that already exists: without `pnpm db:migrate`, the app's new code would find the old schema. When Supabase itself was updated (a new CLI version in `pnpm-lock.yaml`), `pnpm stop` first, so the next start uses the new images.

## 0.8 Starting over

From the lightest to the most thorough. Each step deletes something that cannot be brought back.

| To delete | Run | What is lost |
|---|---|---|
| The local data | `pnpm db:reset` (Supabase running) | Every local account, track and playlist; the database is rebuilt from the migrations, with the demo account |
| Builds and reports | `make clean` | `.nuxt`, `.output`, `coverage`, the Playwright reports (all rebuilt when needed) |
| The dependencies too | `make clean-all` | `node_modules` (`pnpm install` brings it back) |
| The whole local stack | `pnpm stop`, then `pnpm exec supabase stop --no-backup` | The Supabase volumes: database, audio files and covers. The next `pnpm local` starts afresh |
| The Docker-mode image | `docker image rm chronovault:local` | The built app image (the next `pnpm docker` builds it again) |

To remove the project from the computer: all of the above, then delete the folder (`.pnpm-store/` inside it holds the package store) and, if nothing else uses them, the `public.ecr.aws/supabase/…` images in Docker Desktop → *Images* (about 6 GB).

## 0.9 Checks and tests

```bash
make check           # lint, types, unit and component tests with the coverage floors (seconds); before every commit
make test-e2e        # end-to-end tests on a production build (:3200); Supabase must be running
make ci              # everything the CI runs, database tests included
```

The first `make test-e2e` downloads Playwright's own Chromium (~150 MB; macOS: `~/Library/Caches/ms-playwright`, Windows: `%LOCALAPPDATA%\ms-playwright`). The end-to-end tests make throwaway accounts (`e2e-…@chronovault.test`) and leave yours alone. What each level covers: [12](12-testing.md#12-testing). How work reaches `main` (a branch, CI, `make merge`): [14.1](14-conventions.md#141-git-workflow).

## 0.10 When something goes wrong

Run `node scripts/doctor.mjs` first, then look up the message in [16. Troubleshooting](16-troubleshooting.md#16-troubleshooting). The usual ones:

- **"Docker is not running":** open Docker Desktop and wait for the engine.
- **Always sent back to `/login`:** `.env` missing or stale: `make env`, then restart the dev server.
- **Nuxt starts on a port other than 3100:** something else holds it ([16](16-troubleshooting.md#16-troubleshooting)).
- **A computer that ran Chronovault on http://localhost:3000:** follow [Updating a computer set up before the port change](11-local-development.md#updating-a-computer-set-up-before-the-port-change) once.

---

[Contents](../README.md#documentation) · [1. Features](01-features.md) →
