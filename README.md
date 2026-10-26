# Chronovault

*The Sound of Time Remembering Itself.*

The music library and player of **Chronovault**, a Suno artist exploring history through sound (metal, folk, cinematic), made to keep its tracks and share them. The app carries the project's name and look: the portal logo, gold and spectral blue on night blue, and the Chronovault artwork wherever a track has no cover of its own ([5.6](docs/05-architecture.md#56-brand-and-theme)). It was first called ChronoPlayer: every name, from the repository to the storage bucket, now says Chronovault, and what browsers had saved under the old name moves to the new one by itself ([7.15](docs/07-data-flows.md#715-where-each-piece-of-data-lives)).

A personal music library in the browser. Upload your tracks, play them with an interactive waveform, manage their metadata (composers, genre, Suno prompt, mastering status…), sync the lyrics line by line to watch them scroll while you listen, organize tracks in playlists and share tracks or playlists through a link.

It works on desktop and smartphones and can be installed as a PWA. It runs entirely on free tiers: Supabase (database, auth, covers), Cloudflare R2 (audio files) and Vercel (app).

```bash
pnpm install     # once
pnpm local       # Docker Desktop must be open → http://localhost:3100
                 # demo account: demo@chronovault.local / chronovault
```

---

## Quick start

**Prerequisites:** Node.js 24.11+ (or 22.21+), pnpm 12, Docker Desktop (running). Details in [11.1](docs/11-local-development.md#111-prerequisites). **Setting up a new computer (macOS or Windows)?** Run `node scripts/doctor.mjs` and follow the [checklist from a blank computer](docs/11-local-development.md#from-a-blank-computer): it covers every step that is easy to forget. **Ran Chronovault on http://localhost:3000 before?** The ports have changed: follow [Updating a computer set up before the port change](docs/11-local-development.md#updating-a-computer-set-up-before-the-port-change) once.

```bash
pnpm install       # installs dependencies (the package store lives in .pnpm-store/)
pnpm local         # Supabase in Docker + .env + Nuxt dev server
```

Open **http://localhost:3100** and sign in with **`demo@chronovault.local` / `chronovault`** (or create an account: email confirmation is off locally).

| I want to… | Command |
|---|---|
| Develop with hot reload | `pnpm local` (or `make local`) → http://localhost:3100 |
| Run the production build in a container | `pnpm docker` (or `make docker`) → http://localhost:8180 |
| Stop everything (data is kept) | `pnpm stop` (or `make stop`) |
| Look inside the database | Supabase Studio → http://127.0.0.1:54323 |
| Apply a new migration locally | `pnpm db:migrate` (keeps your data) |
| Run all checks before a commit | `make check` (lint, types, unit tests with the coverage floors) |
| Merge the current branch into main and delete it | `pnpm merge:main` (or `make merge`): runs `pnpm check` first, see [14.1](docs/14-conventions.md#141-git-workflow) |
| Check a new computer's prerequisites | `node scripts/doctor.mjs` (or `pnpm doctor`, `make doctor`), see [11.1](docs/11-local-development.md#from-a-blank-computer) |

---

## Documentation

Everything else lives in [`docs/`](docs/), one file per section. Sections keep their numbers, so a reference such as "see 7.5" (in these pages or in a code comment) points to section 7.5 of `docs/07-data-flows.md`. New to the project? Read 1, 5 and 6 first; then 7 for the part you are about to change.

| Section | What it covers |
|---|---|
| [1. Features](docs/01-features.md) | What the app does, area by area: library, upload, player, queue, lyrics sync, draft versions, playlists, sharing, statistics, PWA |
| [3. Commands](docs/03-commands.md) | Every command: the whole stack in one (`pnpm local` / `docker` / `stop`), the `package.json` scripts and the Makefile |
| [4. Tech stack](docs/04-tech-stack.md) | Frameworks, libraries and services, and why each one |
| [5. Architecture](docs/05-architecture.md) | Overview, key principles, where everything runs, rendering modes, reusable building blocks, brand and theme |
| [6. Project structure](docs/06-project-structure.md) | The folder tree, file by file |
| [7. Data flows](docs/07-data-flows.md) | How each feature works end to end: sign-in, loading the library, upload, WAV → FLAC, playback and casting, queue, editing, lyrics, deletion, download, clean-up, playlists, sharing, statistics, draft versions |
| [8. Data model and security](docs/08-data-model-and-security.md) | Tables, migrations, database functions, storage buckets and the security guarantees (RLS, exact storage paths, headers, Content Security Policy, caps) |
| [9. API reference](docs/09-api-reference.md) | Every API route: method, body, answers and errors |
| [10. Configuration](docs/10-configuration.md) | Environment variables, env files and the notable `nuxt.config.ts` settings |
| [11. Local development in detail](docs/11-local-development.md) | Prerequisites (from a blank macOS or Windows computer), what `pnpm local` automates, Docker mode, local services and ports, local data, updating dependencies and the weekly audit |
| [12. Testing](docs/12-testing.md) | Unit, component, database and end-to-end tests, coverage floors, CI |
| [13. Deployment (Supabase + Cloudflare R2 + Vercel)](docs/13-deployment.md) | Supabase Cloud, Cloudflare R2, Vercel, updating production, statistics, keeping Supabase awake |
| [14. Development conventions](docs/14-conventions.md) | Git workflow and code conventions (comments, style, new endpoints and tables) |
| [15. Known limitations and next steps](docs/15-limitations-and-next-steps.md) | What the app does not do yet, and what could come next |
| [16. Troubleshooting](docs/16-troubleshooting.md) | Known problems and their fixes |
