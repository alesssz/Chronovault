# Chronovault

*The Sound of Time Remembering Itself.*

The music library and player of **Chronovault**, a Suno artist exploring history through sound (metal, folk, cinematic), made to keep its tracks and share them. The app carries the project's name and look: the portal logo, gold and spectral blue on night blue, and the Chronovault artwork wherever a track has no cover of its own ([5.6](docs/05-architecture.md#56-brand-and-theme)). It was first called ChronoPlayer: every name, from the repository to the storage bucket, now says Chronovault, and what browsers had saved under the old name moves to the new one by itself ([7.15](docs/07-data-flows.md#715-where-each-piece-of-data-lives)).

A personal music library in the browser. Upload your tracks, play them with an interactive waveform, manage their metadata (composers, genre and subgenre, your own subgenres included, Suno prompt, mastering status…), replace a track's audio with a new file (its master, say) keeping everything else, sync the lyrics line by line to watch them scroll while you listen, organize tracks in playlists and share tracks or playlists through a link. Every track's metadata can be downloaded in one Excel, CSV or JSON file, edited and uploaded back to fill in many tracks at once.

It works on desktop and smartphones and can be installed as a PWA. It runs entirely on free tiers: Supabase (database, auth, covers), Cloudflare R2 (audio files) and Vercel (app).

```bash
pnpm install     # once
pnpm local       # Docker Desktop must be open → http://localhost:3100
                 # demo account: demo@chronovault.local / chronovault
```

Locally the app is **two pieces**: Supabase (database, sign-in, files) in Docker, and Nuxt (the pages **and** the API, one process) on your computer with hot reload. `pnpm local` starts both, in that order ([5.3](docs/05-architecture.md#53-where-everything-runs)).

---

## Quick start

**Prerequisites:** Node.js 24.11+ (or 22.21+), pnpm 12, Docker Desktop (running). **New computer (macOS or Windows)?** Follow [0. Setup](docs/00-setup.md): every step from a blank computer, then how to start, stop, update and wipe the local stack. `node scripts/doctor.mjs` lists what is missing. **Ran Chronovault on http://localhost:3000 before?** The ports have changed: follow [Updating a computer set up before the port change](docs/11-local-development.md#updating-a-computer-set-up-before-the-port-change) once.

```bash
pnpm install       # installs dependencies (the package store lives in .pnpm-store/)
pnpm local         # 1. Supabase in Docker + .env  2. Nuxt (pages + API) here, hot reload
```

Open **http://localhost:3100** and sign in with **`demo@chronovault.local` / `chronovault`** (or create an account: email confirmation is off locally). `pnpm stop` stops everything and keeps the data. `pnpm docker` (http://localhost:8180) is the production build in a container: only to try it, with no hot reload. The everyday commands are in [2. Quick start](docs/02-quick-start.md).

---

## Documentation

Everything else lives in [`docs/`](docs/), one file per section. Sections keep their numbers, so a reference such as "see 7.5" (in these pages or in a code comment) points to section 7.5 of `docs/07-data-flows.md`. New to the project? Set up with 0, then read 1, 5 and 6; then 7 for the part you are about to change.

| Section | What it covers |
|---|---|
| [0. Setup](docs/00-setup.md) | From a blank macOS or Windows computer to the app running: tools (the GitHub CLI included), getting the code (who commits are from, signing gh in), first start, addresses, stopping and starting again, after a pull, starting over, checks |
| [1. Features](docs/01-features.md) | What the app does, area by area: library, upload, player, queue, editor, replacing a track's audio, lyrics sync, draft versions, playlists, sharing, statistics, PWA |
| [2. Quick start](docs/02-quick-start.md) | The everyday commands on a computer already set up: "I want to…" → the command |
| [3. Commands](docs/03-commands.md) | Every command: the whole stack in one (`pnpm local` / `docker` / `stop`), the `package.json` scripts and the Makefile |
| [4. Tech stack](docs/04-tech-stack.md) | Frameworks, libraries and services, and why each one |
| [5. Architecture](docs/05-architecture.md) | Overview, key principles, where everything runs (two pieces: Supabase in Docker, Nuxt with pages and API), rendering modes, reusable building blocks, brand and theme |
| [6. Project structure](docs/06-project-structure.md) | The folder tree, file by file |
| [7. Data flows](docs/07-data-flows.md) | How each feature works end to end: sign-in, loading the library, upload, WAV → FLAC, playback and casting, queue, editing, lyrics, deletion, download, clean-up, playlists, sharing, statistics, draft versions, metadata export and import, replacing a track's audio |
| [8. Data model and security](docs/08-data-model-and-security.md) | Tables, migrations, database functions, storage buckets and the security guarantees (RLS, playlists holding only the owner's tracks, at most 1000, genres a fixed list, a track's subgenre one of its genre's, built-in or its owner's, exact storage paths (a replaced audio file included), shared files signed by name and never listed, uploads signed for one file, headers, Content Security Policy, caps) |
| [9. API reference](docs/09-api-reference.md) | Every API route: method, body, answers and errors |
| [10. Configuration](docs/10-configuration.md) | Environment variables, env files and the notable `nuxt.config.ts` settings |
| [11. Local development in detail](docs/11-local-development.md) | Prerequisites, updating a computer set up before the port change, what `pnpm local` automates, Docker mode, local services and ports, local data, updating dependencies and the dependency audit (weekly, and on every branch that changes them) |
| [12. Testing](docs/12-testing.md) | Unit, component, database and end-to-end tests, coverage floors, CI |
| [13. Deployment (Supabase + Cloudflare R2 + Vercel)](docs/13-deployment.md) | Supabase Cloud, Cloudflare R2, Vercel, updating production (migrations applied by CI, Vercel waiting for them), statistics, keeping Supabase awake, the GitHub repository (`main`'s ruleset, pull request settings, secret scanning, Dependabot) |
| [14. Development conventions](docs/14-conventions.md) | Git workflow (a branch per task, merged through a pull request once CI passes: `pnpm merge:main`) and code conventions (comments, style, page layout, new endpoints and tables) |
| [15. Known limitations and next steps](docs/15-limitations-and-next-steps.md) | What the app does not do yet, and what could come next |
| [16. Troubleshooting](docs/16-troubleshooting.md) | Known problems and their fixes |

Outside the numbered sections, **[Backlog](docs/backlog.md)** lists the work known and waiting (interface, features, backend, tooling…), one entry per point with options and a recommendation; an entry is deleted when its work is done.
