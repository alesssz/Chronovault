<p align="center">
  <img src="public/pwa-192x192.png" alt="Chronovault logo" width="96" height="96">
</p>

<h1 align="center">Chronovault</h1>

<p align="center">
  A music library and player for the browser: upload, play, edit, sync lyrics, share.<br>
  <a href="https://chronovault-music.vercel.app">chronovault-music.vercel.app</a>
</p>

<p align="center">
  <a href="https://github.com/alesssz/Chronovault/actions/workflows/ci.yml"><img src="https://github.com/alesssz/Chronovault/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI"></a>
</p>

Chronovault keeps the tracks of the music project of the same name and shares them with listeners. It works on desktop and phones, installs as a PWA, and runs entirely on free tiers: Supabase (Postgres, Auth, covers), Cloudflare R2 (audio) and Vercel (app). The deployed instance is personal (no public sign-up); shared track and playlist links open without an account.

## Features

- **Library** of thousands of tracks with search, filters and a virtualised list; metadata, genres and subgenres, draft and final versions.
- **Upload** of MP3, WAV, FLAC, AAC, Ogg and WebM straight from the browser, tags and cover read on the way; **WAV converted to FLAC losslessly**, verified bit for bit.
- **Player** that keeps playing across pages: interactive waveform, editable queue saved on the device, shuffle and repeat, lock-screen and media-key controls, Cast and AirPlay.
- **Synced lyrics**: tap-to-sync editor with a zoomable waveform and draggable markers, LRC import and export, lyrics that follow playback.
- **Sharing** of tracks and playlists through server-rendered public pages with link previews; listeners vote on draft versions and leave comments, with no account.
- **Downloads with tags written in** (FLAC, MP3, WAV), **bulk metadata** export and import (Excel, CSV, JSON), listening **statistics**, storage clean-up.

All of it, area by area: [1. Features](docs/01-features.md).

## Engineering highlights

- **Large files never touch the app server.** Vercel functions take about 4.5 MB per request and a FLAC weighs 30–50 MB, so the browser uploads to R2 through a presigned URL valid for that one file (its size and type are part of the signature) and streams from presigned GETs. The server handles small JSON, signs URLs and enforces the rules. ([5.2](docs/05-architecture.md#52-key-principles))
- **The server acts as the user, never as an admin.** Every query carries the user's own JWT, so Postgres Row Level Security decides what each request can reach; the Supabase service key is not used anywhere. A private item answers exactly like a missing one. ([8.5](docs/08-data-model-and-security.md#85-security-guarantees))
- **Audio work happens in the browser.** Tags, cover, duration and waveform peaks are read before the upload, and WAV → FLAC runs libFLAC (WebAssembly) in a Web Worker. The FLAC is uploaded only if the encoder's verify mode, an independent MD5 of the source and a full re-decode all match the original samples; otherwise the WAV goes up unchanged. ([7.4](docs/07-data-flows.md#74-lossless-wav--flac-conversion))
- **One audio engine, many views.** A single `<audio>` element outside the component tree drives the player bar, the full-screen view, the lyrics editor and the public pages; the next track is fetched ahead so it starts without waiting for the network. ([7.5](docs/07-data-flows.md#75-playback))
- **A layered backend with shared contracts.** Routes authenticate and validate; services hold the rules and are unit-tested without Nuxt; repositories query; mappers convert. The same Zod schemas validate the forms and the API. ([5.2](docs/05-architecture.md#52-key-principles))
- **Tested at every level.** Vitest with per-folder coverage floors, pgTAP tests of the RLS policies across two users and an anonymous visitor, and Playwright on desktop, phone and tablet, where any Content Security Policy violation or hydration mismatch fails the test. CI runs it all on every branch and applies production's migrations only after `main` passes. ([12](docs/12-testing.md))

## Tech stack

Nuxt 4 (Vue 3, TypeScript strict, Nitro) · Nuxt UI 4 and Tailwind CSS 4 · Pinia · Supabase (Postgres 17, Auth, Storage) · Cloudflare R2 · Zod · wavesurfer.js · libFLAC (WebAssembly) · Vitest, Playwright, pgTAP · GitHub Actions · Vercel. Why each one: [4. Tech stack](docs/04-tech-stack.md).

## Quick start

Requires Node.js 24, pnpm 12 and Docker Desktop (running). `node scripts/doctor.mjs` checks them and prints the fix for anything missing.

```bash
pnpm install
pnpm local      # Supabase in Docker, then Nuxt (pages and API) with hot reload
```

Open http://localhost:3100 and sign in with `demo@chronovault.local` / `chronovault`. `pnpm check` runs lint, types and unit tests; `pnpm stop` stops the stack and keeps the data. A new computer from scratch: [0. Setup](docs/00-setup.md).

## Documentation

| Section | Contents |
|---|---|
| [0. Setup](docs/00-setup.md) | From a blank macOS or Windows computer to the app running |
| [1. Features](docs/01-features.md) | What the app does, area by area |
| [2. Quick start](docs/02-quick-start.md) | The everyday commands |
| [3. Commands](docs/03-commands.md) | Every `pnpm` script and `make` target |
| [4. Tech stack](docs/04-tech-stack.md) | Frameworks, libraries and services, and why |
| [5. Architecture](docs/05-architecture.md) | Overview, key principles, where everything runs, rendering, brand and theme |
| [6. Project structure](docs/06-project-structure.md) | The folder tree |
| [7. Data flows](docs/07-data-flows.md) | How each feature works end to end |
| [8. Data model and security](docs/08-data-model-and-security.md) | Tables, migrations, database functions, storage and security guarantees |
| [9. API reference](docs/09-api-reference.md) | Every API route: method, body, answers, errors |
| [10. Configuration](docs/10-configuration.md) | Environment variables and notable Nuxt settings |
| [11. Local development](docs/11-local-development.md) | The local stack in detail, Docker mode, dependency updates |
| [12. Testing](docs/12-testing.md) | Test levels, coverage floors, CI |
| [13. Deployment](docs/13-deployment.md) | Supabase Cloud, Cloudflare R2, Vercel, updating production |
| [14. Conventions](docs/14-conventions.md) | Git workflow and code conventions |
| [15. Limitations and next steps](docs/15-limitations-and-next-steps.md) | What the app does not do yet, and where it could go |
| [16. Troubleshooting](docs/16-troubleshooting.md) | Known problems and their fixes |

Work known and waiting is in the [backlog](docs/backlog.md).
