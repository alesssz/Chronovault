# ChronoPlayer

A personal music library in the browser. Upload your tracks, play them with an interactive waveform, manage their metadata (composers, genre, Suno prompt, mastering status…), sync the lyrics line by line to watch them scroll while you listen, organize tracks in playlists and share tracks or playlists through a link.

It works on desktop and smartphones and can be installed as a PWA. It runs entirely on free tiers: Supabase (database, auth, covers), Cloudflare R2 (audio files) and Vercel (app).

```bash
pnpm install     # once
pnpm local       # Docker Desktop must be open → http://localhost:3000
                 # demo account: demo@chronoplayer.local / chronoplayer
```

---

## Contents

1. [Features](#1-features)
2. [Quick start](#2-quick-start)
3. [Commands](#3-commands)
4. [Tech stack](#4-tech-stack)
5. [Architecture](#5-architecture)
6. [Project structure](#6-project-structure)
7. [Data flows](#7-data-flows)
8. [Data model and security](#8-data-model-and-security)
9. [API reference](#9-api-reference)
10. [Configuration](#10-configuration)
11. [Local development in detail](#11-local-development-in-detail)
12. [Testing](#12-testing)
13. [Deployment (Supabase + Cloudflare R2 + Vercel)](#13-deployment-supabase--cloudflare-r2--vercel)
14. [Development conventions](#14-development-conventions)
15. [Known limitations and next steps](#15-known-limitations-and-next-steps)
16. [Troubleshooting](#16-troubleshooting)

---

## 1. Features

| Area | What it does |
|---|---|
| **Accounts** | Sign-up, sign-in and sign-out with email and password. Each user only sees their own tracks and playlists. |
| **Library** | Track list with cover, composers, duration, genre, mastering status, synced-lyrics and visibility badges. Search (title, composers, album), genre and mastering filters, sorting. Clicking a track's name plays it; clicking the name of the track already in the player opens the full-screen view. |
| **Upload** | Drop several files at once (MP3, WAV, FLAC, AAC/M4A, OGG/Opus, WebM; max 500 MB each). Title, composers, album, year, genre, lyrics and cover are read from the tags. **WAV files are converted to FLAC losslessly**, verified bit for bit ([7.4](#74-lossless-wav--flac-conversion)). Direct upload to storage with a progress bar, retried on network errors. |
| **Player** | Bottom bar that stays visible across pages. Clickable and draggable waveform, elapsed and remaining time, play/pause, stop, previous/next, volume and mute (the volume is remembered). Lock-screen and media-key controls (Media Session). |
| **Queue** | "Play next" and "Add to queue" in every track menu (library and playlists). The **Up next** panel (from the player bar, or the full-screen view on phones) shows the track playing and the upcoming ones: drag to reorder (mouse or touch), move up/down, remove, play one right away, clear. The queue is **saved on the device**: after a reload you find the same queue and track, paused where you left it. |
| **Full-screen player** | Large cover, waveform, controls and **synced lyrics**: the active line is highlighted, the text scrolls by itself, clicking a line seeks there. Section headers (`[Verse 1]`, `[Chorus]`) are shown as titles. |
| **Editor** | Title, composers, album, year, genre (built-in, or custom ones created on the fly), description, Suno prompt, mastered yes/no, visibility (private / unlisted / public), cover (you choose the square in a crop editor — drag, zoom with wheel/pinch/slider — then it is converted to WebP), lyrics with section headers. |
| **Lyrics sync** | "Tap to sync": while the track plays, press <kbd>Space</kbd> at the start of each line. Playback at 0.5× / 0.75× with the pitch preserved, a zoomable detailed waveform with a **draggable marker per line**, replay of the selected line (<kbd>R</kbd>), ±0.05 s nudges (<kbd>←</kbd> <kbd>→</kbd>), undo (<kbd>↑</kbd>), **LRC** import and export. All manual: no automatic alignment. |
| **Playlists** | Ordered lists of your tracks. Create them from the Playlists page or from a track's menu ("Add to playlist" → "New playlist…"), reorder by dragging (mouse or touch) or with Move up/down, remove tracks, play them in sequence. Cover: an automatic 2×2 mosaic of the first tracks' covers, or an image you upload. |
| **Sharing** | Unlisted and public **tracks** get a public page, `/t/<track id>`: cover, title, composers, album, year, genre, description, lyrics and a player. Shared **playlists** get `/p/<playlist id>`: the track list, sequential playback, and the lyrics and description of the track being played. No account needed to open them. "Copy share link" in the menus and on the edit pages. The Suno prompt and the mastering status are **never** shared. **Sharing a playlist shares all its tracks, private ones included** (only inside the playlist; the editor warns about them). Link previews in chat apps and social networks show the title and the cover. |
| **Storage** | Account menu → Storage: how much audio and how many covers you store, and the **orphaned files** left by interrupted uploads, which can be deleted in one click (files younger than 24 hours are kept: an upload may still be in progress). |
| **PWA** | Installable on phones and desktop (manifest, icons, service worker for static assets). |

**No AI.** The app uses no artificial-intelligence service, SDK or model. The "Suno prompt" field is just a text field to note down the prompt used elsewhere.

---

## 2. Quick start

**Prerequisites:** Node.js 24.11+ (or 22.21+), pnpm 12 (`corepack enable` or `npm i -g pnpm`), Docker Desktop (running). Details in [11.1](#111-prerequisites).

```bash
pnpm install       # installs dependencies (the package store lives in .pnpm-store/)
pnpm local         # Supabase in Docker + .env + Nuxt dev server
```

Open **http://localhost:3000** and sign in with **`demo@chronoplayer.local` / `chronoplayer`** (or create an account: email confirmation is off locally).

| I want to… | Command |
|---|---|
| Develop with hot reload | `pnpm local` (or `make local`) → http://localhost:3000 |
| Run the production build in a container | `pnpm docker` (or `make docker`) → http://localhost:8080 |
| Stop everything (data is kept) | `pnpm stop` (or `make stop`) |
| Look inside the database | Supabase Studio → http://127.0.0.1:54323 |
| Apply a new migration locally | `pnpm db:migrate` (keeps your data) |
| Run all checks before a commit | `make check` (lint, types, unit tests) |
| Merge the current branch into main and delete it | `pnpm merge:main` (or `make merge`), see [14.1](#141-git-workflow) |

---

## 3. Commands

### 3.1 The whole stack in one command

| Command | What it does | App URL |
|---|---|---|
| `pnpm local` / `make local` | Checks Docker → starts Supabase (if not running) → writes `.env` → runs the Nuxt **dev server** in the foreground. <kbd>Ctrl</kbd>+<kbd>C</kbd> stops Nuxt; Supabase keeps running. | http://localhost:3000 |
| `pnpm docker` / `make docker` | Checks Docker → starts Supabase → writes `.env.docker` → builds the **production image** and starts the container in the background → waits until `/api/health` answers. | http://localhost:8080 |
| `pnpm stop` / `make stop` | Removes the app container and stops Supabase. **Data is kept** (Docker volumes) for the next start. | |
| `make docker-logs` | Follows the app container logs (`docker compose logs -f app`). | |

Docker Desktop is never started automatically: when it is not running, the commands stop with a clear message. Both modes use the same local Supabase, so they share the same accounts and tracks.

### 3.2 `package.json` scripts

| Script | What it does |
|---|---|
| `pnpm local` · `pnpm docker` · `pnpm stop` | The whole stack, see above (`scripts/stack.mjs`) |
| `pnpm dev` | Nuxt dev server only (Supabase and `.env` must already be there) |
| `pnpm build` · `pnpm preview` | Production build (`.output/`) · serve it locally |
| `pnpm lint` · `pnpm lint:fix` | ESLint, formatting rules included · with automatic fixes |
| `pnpm typecheck` | vue-tsc over app, server, shared and config files |
| `pnpm test` | All Vitest tests (unit + components) |
| `pnpm test:unit` · `pnpm test:nuxt` | Unit tests only · component tests only |
| `pnpm test:watch` · `pnpm test:coverage` | Watch mode · coverage report in `coverage/` |
| `pnpm test:db` | pgTAP database tests (local Supabase must be running) |
| `pnpm test:e2e` · `pnpm test:e2e:ui` | Playwright end-to-end tests · in UI mode |
| `pnpm check` | lint + typecheck + test |
| `pnpm db:start` · `db:stop` · `db:status` | Start / stop the local Supabase stack · print its URLs and keys |
| `pnpm db:migrate` | **Apply new migrations to the local database, keeping its data** |
| `pnpm db:reset` | Recreate the local database from migrations + seed — **deletes every local account and track** |
| `pnpm db:migration <name>` | Create a new, empty migration file |
| `pnpm db:lint` | Static analysis of the schema (security and performance warnings) |
| `pnpm db:types` | Regenerate `shared/types/database.types.ts` (written only when generation succeeds) |
| `pnpm db:push` | Apply pending migrations to the linked Supabase Cloud project |
| `pnpm env:local` | Write `.env` from the running local stack |
| `pnpm r2:check [origin…]` | Check the Cloudflare R2 setup in `.env.r2`: upload, range streaming, size check, CORS, delete |
| `pnpm generate:pwa-assets` | Regenerate the PWA icons from `public/favicon.svg` |
| `pnpm merge:main [--yes]` | Merge the current (pushed) branch into `main`, push, delete the branch locally and on GitHub, end on an up-to-date `main` ([14.1](#141-git-workflow)) |

### 3.3 Makefile

`make help` lists every target. On Windows, run `make` from Git Bash (it ships GNU Make) or use the `pnpm` scripts.

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
| `make check` | lint + typecheck + test: quick checks before a commit |
| `make ci` | Everything the CI runs (adds `db-lint`, `db-test`, `test-e2e`) |
| `make merge` | `pnpm merge:main`: merge the current branch into `main` and clean up |
| `make clean` · `make clean-all` | Remove builds and reports · also `node_modules` |

---

## 4. Tech stack

| Layer | Technology | Notes |
|---|---|---|
| Framework | **Nuxt 4.6** (Vue 3.5, Vite, Nitro) | Frontend and backend in one project; `app/` is the source directory |
| Language | **TypeScript 6** (strict) | Database types generated from the schema (`pnpm db:types`) |
| UI | **Nuxt UI 4** + Tailwind CSS 4 | Accessible components (Reka UI), Lucide icons via Iconify, light/dark mode |
| State | **Pinia 4** | One store: the player |
| Utilities | **VueUse 15** (+ `@vueuse/integrations` with **SortableJS**) | Event listeners, drag-and-drop reordering |
| Database, auth, cover storage | **Supabase** (Postgres 17, Auth, Storage) | Row Level Security on every table |
| Supabase integration | **@nuxtjs/supabase 2** | Session in cookies, readable on the server; route protection |
| Audio storage | **Cloudflare R2** (S3-compatible) | Free egress for streaming; presigned URLs signed with **aws4fetch**. Locally, Supabase's S3 endpoint stands in for it |
| Waveform | **wavesurfer.js 8** (+ Regions plugin) | Stored peaks for the player; full decoding only in the sync editor |
| Audio tags | **music-metadata 12** | Read in the browser |
| WAV → FLAC | **libflacjs** (libFLAC 1.3.4, WebAssembly) + **hash-wasm** (MD5) | Reference encoder in a Web Worker, verified bit for bit |
| Validation | **Zod 4** | The same schemas for client forms and API bodies |
| PWA | **@vite-pwa/nuxt** | Manifest, icons, Workbox service worker (static assets only) |
| Tests | **Vitest 5**, **@nuxt/test-utils**, **Playwright**, **pgTAP** | Unit, components, end-to-end, database |
| Code quality | ESLint 10 (`@nuxt/eslint`, stylistic rules, no Prettier), vue-tsc | |
| Package manager | **pnpm 12** | Store inside the project (`.pnpm-store/`) |
| Containers | Docker (multi-stage `Dockerfile`, `compose.yaml`) | Local production-like run |
| Hosting | **Vercel** (app) · **Supabase Cloud** (data) · **Cloudflare R2** (audio) | All on free plans |
| CI | GitHub Actions | Lint, types, unit, database and end-to-end tests |

---

## 5. Architecture

### 5.1 Overview

```mermaid
flowchart LR
  subgraph Browser
    UI[Pages and components]
    Store[(Pinia<br/>player store)]
    Engine[AudioEngine<br/>one &lt;audio&gt;]
    Analysis[File analysis<br/>tags · cover · peaks]
    Flac[Web Worker<br/>WAV → FLAC]
    UI <--> Store
    Store <--> Engine
    Analysis --> Flac
  end

  subgraph Vercel["Nuxt on Vercel (Nitro)"]
    SSR[Public pages<br/>/t/:id · /p/:id<br/>server-rendered]
    API["server/api/*<br/>thin routes"]
    Services[services/*<br/>business logic]
    Repos[repositories/*<br/>queries]
    API --> Services --> Repos
    SSR --> API
  end

  subgraph Supabase
    Auth[Auth]
    DB[(Postgres<br/>+ RLS)]
    Storage[(Storage<br/>covers)]
  end

  subgraph Cloudflare
    R2[(R2<br/>audio files)]
  end

  UI -- "$fetch /api/*<br/>(session cookie)" --> API
  UI -- "sign-in / sign-out" --> Auth
  UI -- "cover upload<br/>(user's own folder)" --> Storage
  Repos -- "user's JWT or anonymous<br/>(never the service key)" --> DB
  Repos -- "signed URLs" --> Storage
  Repos -- "presigned URLs (S3 API)" --> R2
  Flac -- "direct upload<br/>(presigned PUT)" --> R2
  Engine -- "streaming<br/>(presigned GET, range requests)" --> R2
```

### 5.2 Key principles

1. **Files never go through the app server.** Vercel functions accept requests of about 4.5 MB, while a FLAC weighs 30-50 MB. The browser uploads audio straight to R2 and covers straight to Supabase Storage, and streams audio from presigned URLs. The server only handles small JSON payloads and signs URLs; storage credentials never leave it.
2. **The server acts as the user, never as an admin.** Every query carries the user's own JWT (or none, for visitors of public pages), so Postgres Row Level Security decides what each request can read or write. Even a bug in server code cannot expose another user's data. The Supabase service key is not used anywhere.
3. **Audio is processed in the browser.** Tags, cover, duration, waveform peaks and the WAV → FLAC conversion all happen before the upload, so the server never decodes audio.
4. **One audio engine.** A single `<audio>` element lives outside components. The player bar, the full-screen view, the lyrics editor and the public pages are views over the same store, which is why music keeps playing across page changes.
5. **A layered backend.** `api` (HTTP: authenticate, validate) → `services` (rules, no Nuxt dependency, unit-tested with mocks) → `repositories` (queries) → `mappers` (rows ↔ domain types).
6. **Shared contracts.** Domain types (`shared/types`) and Zod schemas (`shared/schemas`) are used by both sides: the client forms validate exactly like the API.
7. **Private by default.** Buckets are private, tracks and playlists start private, other people only ever reach an item by its link, and a private item answers exactly like a missing one (`404`).

### 5.3 Where everything runs

| Piece | `pnpm local` | `pnpm docker` | Production |
|---|---|---|---|
| Nuxt app | Dev server on the host, :3000 | Compose service `app` (project `chronoplayer`), :8080 | Vercel |
| Postgres, Auth, Storage (covers) | Supabase CLI containers (:54321) | Same Supabase containers, reached via `host.docker.internal` | Supabase Cloud |
| Audio files | Supabase's local S3 endpoint, bucket `audio` | Same | Cloudflare R2, bucket `chronoplayer-audio` |
| Config file | `.env` | `.env.docker` | Vercel environment variables |

The local database and the production database are **completely separate**: accounts, tracks and playlists created locally never appear online, and vice versa.

### 5.4 Rendering modes

| Routes | Rendering | Why |
|---|---|---|
| `/`, `/tracks/**`, `/playlists`, `/playlists/**` | Client only (`ssr: false`) | Personal pages that use browser APIs (Web Audio, files, workers); nothing to gain from SSR |
| `/login`, `/confirm` | Client only | A form submitted before hydration would send the password in the URL (native GET submit) |
| `/t/:id`, `/p/:id` | **Server-rendered** | Link previews (chat apps, social networks) read the HTML: title, description and image must be in it |
| `/api/**` | API, `Cache-Control: no-store` | Responses are personal or contain signed URLs |

The `@nuxtjs/supabase` route middleware sends signed-out visitors to `/login`, except on `/t/*` and `/p/*`.

---

## 6. Project structure

```
ChronoPlayer/
├── app/                              # Frontend (Nuxt 4 srcDir)
│   ├── app.vue · error.vue           # Root component · fatal error page
│   ├── app.config.ts                 # Nuxt UI theme (orange on zinc)
│   ├── assets/css/main.css           # Tailwind + Nuxt UI, base scale, room for the player bar
│   ├── components/
│   │   ├── AppHeader.vue · AppLogo.vue · ConfirmDialog.vue · StorageDialog.vue · CoverCropDialog.vue
│   │   ├── player/                   # PlayerBar, PlayerExpanded, PlayerQueue + PlayerQueueList (Up next),
│   │   │                             #   PlayerWaveform, PlayerControls, PlayerVolume
│   │   ├── lyrics/                   # LyricsView, LyricsSyncEditor (tap to sync), LyricsSyncTimeline (markers)
│   │   ├── playlist/                 # PlaylistCover (custom or mosaic), PlaylistCreateDialog
│   │   └── track/                    # TrackList, TrackCover, TrackCoverPicker
│   ├── composables/                  # useTrackUploader (upload queue), useGenres, usePlaylists, useShareLink,
│   │                                 #   useQueueActions (Play next / Add to queue with toasts)
│   ├── layouts/                      # default (header + player), auth (sign-in), public (share pages)
│   ├── lib/                          # Browser code without Vue
│   │   ├── audio-engine.ts           #   the single <audio> element and its events
│   │   ├── audio-analysis.ts         #   tags, cover, duration, peaks
│   │   ├── direct-upload.ts          #   PUT to a presigned URL with progress and retries
│   │   ├── image.ts                  #   crop geometry, square WebP covers
│   │   ├── queue-storage.ts          #   saved play queue (localStorage)
│   │   ├── media-session.ts · theme.ts
│   │   └── flac/                     #   wav.ts (parser) · encoder.ts (encode + verify) · flac.worker.ts · convert.ts
│   ├── pages/
│   │   ├── index.vue                 # Library
│   │   ├── login.vue · confirm.vue   # Sign-in / sign-up · auth callback
│   │   ├── tracks/new.vue            # Upload
│   │   ├── tracks/[id]/edit.vue      # Track editor (details, lyrics, sync)
│   │   ├── playlists/index.vue       # Playlists
│   │   ├── playlists/[id].vue        # Playlist editor
│   │   ├── t/[id].vue                # Public track page (SSR)
│   │   └── p/[id].vue                # Public playlist page (SSR)
│   ├── plugins/                      # media-session.client.ts · queue-persistence.client.ts
│   ├── services/api.ts               # Typed API client (the only place that knows the URLs)
│   ├── stores/player.ts              # Player store: editable queue, sources, expired-URL recovery
│   └── utils/errors.ts               # Human-readable error messages
├── server/                           # Backend (Nitro)
│   ├── api/                          # HTTP routes (see section 9)
│   ├── services/                     # tracks · genres · playlists · sharing · storage-cleanup
│   ├── repositories/                 # tracks · genres · playlists · sharing · storage (covers) · audio-storage (R2)
│   ├── mappers/                      # track.ts · playlist.ts (rows ↔ domain types)
│   └── utils/                        # auth (requireAuth, visitorClient) · validation · errors · audio-storage
├── shared/                           # Pure code used by client and server
│   ├── schemas/                      # track.ts · playlist.ts (Zod)
│   ├── types/                        # track.ts · playlist.ts · storage.ts · database.types.ts (generated)
│   └── utils/                        # lyrics (LRC) · peaks · storage-paths · audio-files · time
├── supabase/
│   ├── config.toml                   # Local stack (ports, auth settings, S3 protocol)
│   ├── migrations/                   # Versioned schema (section 8.2)
│   ├── seed.sql                      # Local demo user
│   └── tests/database/               # pgTAP: rls.test.sql · playlists.test.sql
├── test/
│   ├── unit/                         # Vitest in Node: app/, server/, shared/, scripts/
│   ├── nuxt/                         # Vitest in a Nuxt environment: components
│   └── e2e/                          # Playwright: auth, library, sharing, playlists
├── scripts/
│   ├── stack.mjs                     # pnpm local / docker / stop
│   ├── lib/local-stack.mjs           # Docker check, Supabase status, .env writing
│   ├── setup-env.mjs                 # pnpm env:local
│   ├── gen-types.mjs                 # pnpm db:types
│   ├── check-r2.mjs                  # pnpm r2:check
│   ├── merge-main.mjs                # pnpm merge:main
│   └── lib/merge-message.mjs         # cumulative merge commit message
├── public/                           # Favicon and PWA icons
├── Dockerfile · compose.yaml · .dockerignore
├── Makefile · package.json · pnpm-workspace.yaml
├── nuxt.config.ts · vitest.config.ts · playwright.config.ts · eslint.config.mjs · pwa-assets.config.ts · tsconfig.json
├── .env.example · .env.r2.example    # Templates (the real .env files are git-ignored)
└── .github/workflows/ci.yml
```

---

## 7. Data flows

Every flow below names the files involved, so it can be followed in the code.

### 7.1 Authentication and route protection

```mermaid
sequenceDiagram
  participant B as Browser
  participant A as Supabase Auth
  participant N as Nuxt server
  participant DB as Postgres
  B->>A: signInWithPassword / signUp (login.vue)
  A-->>B: session: access token (JWT) + refresh token
  Note over B: @nuxtjs/supabase stores the session in cookies<br/>and refreshes the access token before it expires
  B->>N: GET /api/tracks (cookies sent automatically)
  N->>N: requireAuth(): verify the JWT, read `sub` (user id)
  N->>DB: query with the user's JWT → RLS applies
  DB-->>N: only the user's rows
  N-->>B: 200 JSON · or 401 without a valid session
```

- **Route protection.** The `@nuxtjs/supabase` middleware sends signed-out users to `/login` and remembers the requested page in a cookie; after sign-in, `login.vue` goes back there (`useSupabaseCookieRedirect`). Public pages (`/t/*`, `/p/*`) are excluded.
- **Sign-up.** Locally, email confirmation is off: the account is usable immediately. In production Supabase sends a confirmation link pointing to `/confirm`, where the session is created and the user is redirected. For a personal deployment you can disable sign-ups altogether ([13.4](#134-after-the-first-deploy)).
- **Sign-out** (`AppHeader.vue`): stops the player (no audio for a signed-out user), clears the session, goes to `/login`.
- **Server side** (`server/utils/auth.ts`): `requireAuth(event)` returns `{ userId, db }`, where `db` is a Supabase client carrying the user's JWT. Public routes use `visitorClient(event)`: the visitor's session if any, otherwise the anonymous role.

### 7.2 Loading the library

1. `pages/index.vue` calls `GET /api/tracks` once (`tracksApi.list`).
2. `tracks.service.listTracks` reads the summary columns only (no lyrics, peaks or long texts) and signs **all covers in one request** to Supabase Storage (`createSignedUrls`, valid 6 hours).
3. The page filters (search, genre, mastering) and sorts **in the browser**: no request per keystroke.
4. Genres come from `GET /api/genres` (built-in + the user's custom ones), loaded once and shared by every page (`useGenres`).
5. Playing a track passes the **currently filtered list** as the queue: "next" follows what is on screen.

### 7.3 Uploading a track

```mermaid
sequenceDiagram
  participant U as User
  participant B as Browser
  participant W as Web Worker
  participant N as Nuxt API
  participant R as Cloudflare R2
  participant S as Supabase Storage
  participant D as Postgres

  U->>B: drops files (tracks/new.vue)
  B->>B: analyzeAudioFile(): tags (music-metadata), cover,<br/>duration and 1000 peaks (decoded at 8 kHz)
  opt WAV file
    B->>W: WAV bytes (transferred, not copied)
    W->>W: parse → encode (libFLAC, verify mode) →<br/>MD5 check → full decode + sample comparison
    W-->>B: verified FLAC, or "keep the WAV" + reason
  end
  B->>B: trackId = crypto.randomUUID()
  B->>N: POST /api/tracks/upload-url {trackId, extension, mimeType, size}
  N->>N: build key <userId>/<trackId>.<ext> (never from the client)
  N-->>B: presigned PUT URL (valid 1 hour)
  B->>R: PUT the file (progress bar, up to 3 attempts)
  opt cover found in the tags
    B->>B: center crop + resize → WebP 800×800
    B->>S: upload covers/<userId>/<trackId>.webp (RLS: own folder only)
  end
  B->>N: POST /api/tracks {id, metadata, audioPath, coverPath, peaks…}
  N->>N: Zod validation · paths must be <userId>/<trackId>.*
  N->>R: HEAD: file there, with exactly the declared size?
  N->>D: INSERT tracks (RLS: user_id = auth.uid())
  N-->>B: 201 TrackDetail
```

- **One file at a time** (`useTrackUploader`): parallel uploads would compete for bandwidth and memory, and the conversion is CPU-heavy. Files dropped while the queue runs are picked up by the same loop. Closing the page during an upload asks for confirmation.
- **Statuses** shown per file: queued → analyzing → converting (WAV only) → uploading → saving → done, or error with the reason.
- **Tags → metadata.** Title (or the file name), composers (composer tags, else the artist), album, year (1000-9999 only), lyrics, cover. The genre tag is matched to an existing genre with the same name; genres are never created automatically.
- **Failure handling:**

| Failure | What happens |
|---|---|
| Unsupported format or > 500 MB | Shown as failed immediately, nothing uploaded |
| Tags unreadable | Defaults (file name as title), upload continues |
| Audio not decodable in the browser | No waveform peaks (a flat placeholder is drawn), upload continues |
| FLAC conversion impossible or not verified | The original WAV is uploaded, with the reason shown |
| Network error or 5xx during the PUT | Retried twice, with growing delays |
| Cover conversion/upload fails | The track is saved without a cover |
| Stored file missing or of a different size | The server deletes it and refuses the track (400) |
| Database insert fails | The server deletes the audio, the browser deletes the cover |
| Browser closed between the upload and the registration | The file stays in R2 unused: an orphan, removed from the Storage dialog ([7.11](#711-storage-clean-up)) |

### 7.4 Lossless WAV → FLAC conversion

WAV files are converted to FLAC in the browser before uploading. FLAC is **lossless**: it compresses audio the way a ZIP file compresses text, and decoding it gives back exactly the samples of the original WAV. Savings depend on the music: typically 30-50% for quiet or acoustic material, around 20% for loud, dense or noisy masters.

The result is never trusted blindly. A FLAC is uploaded only when **all** these checks pass (`app/lib/flac/encoder.ts`):

1. **Samples read straight from the file.** The WAV is parsed byte by byte (`app/lib/flac/wav.ts`): no Web Audio decoding, no resampling, no float conversion.
2. **libFLAC verify mode.** The reference encoder decodes every frame while encoding and compares it with the input.
3. **Source MD5 = stream MD5.** The MD5 of the WAV audio bytes, computed independently of our parser, must equal the MD5 libFLAC writes in the FLAC header (STREAMINFO): the encoder received exactly the samples of the file.
4. **Full decode.** The whole FLAC is decoded again with MD5 checking on, and every decoded sample is compared with the original.

If anything fails, the **original WAV is uploaded unchanged**. It is also kept when FLAC cannot store it exactly:

| WAV | Result |
|---|---|
| 8, 16 or 24-bit integer PCM, up to 8 channels | Converted to FLAC |
| 32-bit floating point | Kept as WAV (FLAC stores integer samples only) |
| 32-bit integer | Kept as WAV (not supported by the bundled libFLAC 1.3) |
| Compressed encodings (ADPCM, μ-law…), RF64 | Kept as WAV |
| FLAC not smaller than the WAV | Kept as WAV |

Non-audio WAV chunks (markers, cue points, `LIST` info) are not carried over: titles and other metadata live in the database. The worker (`flac.worker.ts`) keeps the page responsive — a 100 MB 24-bit WAV is converted and verified in about 2 seconds on a desktop browser — and a watchdog keeps the WAV if the worker stays silent for 30 seconds. The upload list shows the outcome (`99.7 MB → 78.9 MB (−21%), lossless, verified bit for bit`, or why the WAV was kept).

### 7.5 Playback

```mermaid
sequenceDiagram
  participant UI as Components
  participant P as Player store
  participant E as AudioEngine
  participant N as Nuxt API
  participant R as Cloudflare R2

  UI->>P: playTrack(track, queue)
  par
    P->>N: GET /api/tracks/:id (lyrics, peaks…)
  and
    P->>N: GET /api/tracks/:id/playback
    N-->>P: presigned GET URL (6 hours)
  end
  P->>E: load(url) · play()
  E->>R: streaming with range requests
  loop every animation frame while playing
    E-->>P: time · duration · play/pause/ended
    P-->>UI: waveform, times, active lyric line
  end
  E-->>P: ended → next track in the queue
```

- **The engine** (`app/lib/audio-engine.ts`) wraps one `<audio>` element created on first use, outside Vue. While playing it reports the time on every animation frame (`timeupdate` alone fires only ~4 times a second, too coarse for lyrics).
- **The store** (`app/stores/player.ts`) holds the queue, the current track, status, time, volume (saved in `localStorage`), speed and the full-screen flag. Every track change increments a token: responses of superseded loads (fast double clicks) are ignored.
- **Track sources.** The store fetches data and URLs from a *source*: the library (signed-in API), a shared track or a shared playlist (public API). The same player, waveform and lyrics components therefore work on the public pages.
- **Waveform** (`PlayerWaveform.vue`): wavesurfer.js draws the stored peaks on the engine's own `<audio>` element; clicking, dragging or ←/→ seek directly. Nothing is downloaded twice.
- **"Previous"** restarts the current track when more than 3 seconds have played, otherwise goes back one track.
- **Media Session** (`plugins/media-session.client.ts`): title, artist, album and cover on the lock screen, with play/pause/next/previous/seek controls.

### 7.6 Editable queue

The queue lives in the player store (`app/stores/player.ts`): the tracks already played, the current one (`index`) and the upcoming ones. Playing a track from a list makes that list the queue; from then on it can be edited.

| Action | Where | Effect |
|---|---|---|
| **Play next** | Track menu (library, playlist page); "Play next" in the Up next panel | Puts the track right after the current one. A track already in the queue is moved there instead of duplicated |
| **Add to queue** | Track menu | Appends the track. One already coming up stays where it is ("already in the queue"); one already played is moved to the end |
| **Reorder** | Up next panel: drag handle, or Move up/down | Changes the order of the upcoming tracks |
| **Remove** · **Clear** | Up next panel | Drops one upcoming track · all of them (playback stops after the current track) |
| **Play now** | Up next panel: click a track | Jumps to it; the tracks skipped become "previous" |

- A track appears **at most once** in the queue, and only upcoming tracks can be edited: the current track and the history stay put, and `index` always points at the current track.
- When nothing from the library is playing, "Play next" and "Add to queue" simply start the track. A toast says what happened (`plays next`, `added to the queue`, `already playing`…).
- "Next", the end of a track and the lock-screen controls all follow the edited order.
- The panel (`PlayerQueue.vue` + `PlayerQueueList.vue`) mirrors the store: a drag moves the DOM through SortableJS, then the store receives the move, so the panel and the player never disagree.
- Queue editing applies to library playback only; the public pages have their own fixed order.
- **The queue survives reloads** on the same device (`lib/queue-storage.ts`, `plugins/queue-persistence.client.ts`): it is saved in the browser whenever it changes, every 5 seconds of playback and when the page is hidden. Opening the app again brings back the same queue and track, **paused at the same position**.
  - Only track ids are saved: on restore they are matched against the current library, so deleted tracks drop out (if the current one is gone, the next one is loaded from the start) and covers get fresh URLs.
  - The saved queue belongs to one user: another account on the same browser never sees it.
  - Closing the player (×) or signing out forgets it. Public pages neither restore nor touch it.
  - It is per device: the queue on your phone and on your computer are separate.

### 7.7 Expired streaming URLs

Presigned URLs last 6 hours, and a paused track can sit for longer. The store recovers transparently:

1. **Before resuming or seeking**, if the URL expires within a minute, a fresh one is fetched and loaded at the same position.
2. **If storage refuses a URL anyway** (an error while playing or buffering), the source is reloaded once at the current position, then playback resumes.
3. Only if that also fails is an error shown in the player bar. Pressing play again retries from scratch.

The playback speed survives reloads (`defaultPlaybackRate`), and the waveform follows since it is bound to the same element.

### 7.8 Editing a track

1. `tracks/[id]/edit.vue` loads `GET /api/tracks/:id`. The form validates with the same Zod schema as the server (`trackMetadataSchema`).
2. **Save** sends `PATCH /api/tracks/:id`. The mapper turns only the fields present into columns (`undefined` = unchanged, `null` = cleared); RLS guarantees the track is the user's. Leaving the page with unsaved changes asks for confirmation.
3. **Genre:** typing a new name and choosing "Create" calls `POST /api/genres`, which returns an existing genre with the same name (built-in or custom, case-insensitive) instead of creating a duplicate.
4. **Cover:** a picked image opens the **crop editor** (`CoverCropDialog.vue`, see below); the browser then cuts the chosen square and converts it, uploads it to `covers/<userId>/<trackId>.webp` (overwriting the old one), then sends `PATCH { coverPath }`. Removing it (`coverPath: null`) makes the server delete the file.
5. The updated track is pushed to the player (`syncTrack`), so the bar, the queue and the full-screen view show the new title, cover and lyrics at once.

**The crop editor** (`CoverCropDialog.vue`, used for track and playlist covers):

```mermaid
flowchart LR
  Pick[Image picked] --> Editor["Crop editor<br/>drag · wheel / pinch / slider zoom<br/>arrows · + / −"]
  Editor -- "Use cover" --> Rect["CropRect<br/>{x, y, size} in source pixels"]
  Rect --> Webp["toSquareWebp()<br/>cut · resize ≤ 800 · WebP"]
  Webp --> Upload["Supabase Storage<br/>covers/&lt;userId&gt;/…"]
  Upload --> Patch["PATCH coverPath"]
```

- The frame shows exactly what the cover will be, with a rule-of-thirds grid. It starts on the centered square (what automatic cropping picks), so "Use cover" right away keeps the old behaviour.
- The state is screen-independent (`CropView`: zoom 1-5 and the square's center in source pixels, `app/lib/image.ts`), always clamped so the square never leaves the image: no empty borders.
- Keyboard: arrows move the picture (Shift for bigger steps), `+` / `−` zoom. "Reset" goes back to the centered square.
- Covers read from file tags during an upload are still center-cropped automatically (no dialog in the middle of a batch upload); they can be re-cropped from the edit page.

### 7.9 Lyrics and sync

- **Lyrics** (`lyrics`) are free text; a line in square brackets (`[Chorus]`) is a section header.
- **Synced lyrics** (`lyrics_synced`) are a JSON array `[{ "time": 12.34, "text": "…" }]` sorted by time. Headers are kept as `{ "time": …, "text": "[Verse 1]", "section": true }` with the time of the line they introduce.
- **The editor** (`LyricsSyncEditor.vue`) builds its rows from the lyrics (empty lines skipped). <kbd>Space</kbd> or <kbd>↓</kbd> stamps the next unsynced line with the player's current time; headers are never stamped. "Reload from lyrics" rebuilds the rows keeping the times of lines already synced.
- **Syncing aids** (all manual):
  - speed 0.5× / 0.75× / 1× with the pitch preserved, reset to 1× when leaving the Sync tab (the player bar shows a speed badge meanwhile);
  - a **detailed waveform** (`LyricsSyncTimeline.vue`) that decodes the track itself (the stored 1000 peaks are too coarse to see where a phrase starts), follows playback, zooms from 20 to 400 px/s and shows a numbered, draggable marker per synced line;
  - a **selected line** (the last stamped, or one clicked in the list or on the waveform): <kbd>R</kbd> replays it from 1 s before, <kbd>←</kbd>/<kbd>→</kbd> move it by 0.05 s; <kbd>↑</kbd> undoes the last stamp; <kbd>P</kbd> plays/pauses.
- **LRC** import/export (`shared/utils/lyrics.ts`) keeps sections (`[00:10.00] [Verse 1]`, or an untimed `[Verse 1]` attached to the next timed line), supports several timestamps per line and `[offset:]`.
- **While playing**, the active line is found with a binary search (`findActiveLineIndex`, never a header) and scrolled into view; scrolling by hand pauses auto-scroll for 4 seconds.

### 7.10 Deleting a track

`DELETE /api/tracks/:id`: the row is deleted first (so the track disappears even if storage is slow), the track leaves every playlist (database cascade), then the server removes the audio from R2 and the cover from Supabase Storage, best effort. The page drops it from the list and from the player queue, closing the player if it was playing.

### 7.11 Storage clean-up

An **orphan** is a file in the user's storage folders that no track or playlist uses: an upload interrupted between the transfer and the registration, or a best-effort deletion that failed. The **Storage** dialog (account menu, `StorageDialog.vue`) finds and removes them.

```mermaid
sequenceDiagram
  participant B as Browser
  participant N as Nuxt API
  participant R as Cloudflare R2
  participant S as Supabase Storage
  participant D as Postgres
  B->>N: GET /api/storage
  par
    N->>R: ListObjectsV2 prefix <userId>/
  and
    N->>S: list covers/<userId>/ and covers/<userId>/playlists/ (RLS)
  and
    N->>D: audio and cover paths of the user's tracks and playlists (RLS)
  end
  N-->>B: usage + orphans (deletable, or kept when younger than 24 h)
  B->>N: DELETE /api/storage/orphans (after "Delete N files")
  N->>N: scan again — the client's list is never trusted
  N->>R: DELETE each old orphan audio file
  N->>S: remove each old orphan cover
  N-->>B: deleted files, freed bytes, files kept
```

- **Only the user's own folders**, read with the user's own rights: the R2 listing is limited to the `<userId>/` prefix, and Supabase Storage and the database apply RLS. No admin key is involved, so it works the same in production.
- **Never a file in use:** the server compares against the paths of the user's tracks and playlist covers right before deleting.
- **Never an upload in progress:** orphans younger than 24 hours are listed as "Kept for now" (configurable, see [10.1](#101-environment-variables)).
- The dialog also shows the space used: audio (R2) and covers, with file counts.
- The clean-up runs when you ask for it; nothing runs on a schedule.

### 7.12 Playlists

```mermaid
sequenceDiagram
  participant B as Browser
  participant N as Nuxt API
  participant D as Postgres
  B->>N: POST /api/playlists {title, trackIds?}
  N->>D: INSERT playlists, then set_playlist_tracks()
  N-->>B: 201 PlaylistDetail → navigate to /playlists/:id
  B->>N: POST /api/playlists/:id/tracks {trackIds} ("Add to playlist")
  N->>D: read current ids → set_playlist_tracks(current + new)
  B->>N: PUT /api/playlists/:id/tracks {trackIds} (drag, Move up/down, remove)
  N->>D: set_playlist_tracks(): delete + insert in one transaction
  N-->>B: PlaylistDetail (the page replaces its copy)
```

- **Creating:** from the Playlists page, or from a track's menu → "Add to playlist" → "New playlist…" (the playlist starts with that track). The dialog (`PlaylistCreateDialog.vue`) lives in the layout, so any page can open it.
- **Adding:** "Add to playlist" → a playlist appends the track; a track already there keeps its place ("Already in …").
- **Reordering and removing** save immediately (`PUT …/tracks` with the full ordered list). The page updates optimistically and rolls back if the request fails. Drag uses SortableJS through a handle (works with touch); Move up/down is the keyboard-friendly alternative.
- **Atomic order.** `set_playlist_tracks()` deletes and re-inserts every row in one database transaction, running with the caller's rights: RLS refuses other users' playlists and tracks.
- **Covers.** A custom cover goes through the same crop editor as track covers, and is uploaded to `covers/<userId>/playlists/<playlistId>.webp`. Without one, the UI shows a **mosaic**: the server signs the covers of the first 4 tracks that have one; 4 covers make a 2×2 grid, fewer show the first alone (`PlaylistCover.vue`).
- **Play all** queues the playlist's tracks in order in the normal player.
- **Deleting** a playlist removes it and its custom cover; its tracks stay in the library.

### 7.13 Sharing

| Visibility | Who can listen | Share page |
|---|---|---|
| `private` | Only the owner | None: the link answers `404`, exactly like a missing item |
| `unlisted` | Anyone with the link | `noindex`: kept out of search engines |
| `public` | Anyone with the link | Can be indexed by search engines |

There is no public catalog: other people reach an item only through its link (`/t/<track id>` or `/p/<playlist id>`); ids are random UUIDs, so links cannot be guessed. The share boxes and "Copy share link" use the **saved** visibility: a change applies once saved.

**A shared track** (`pages/t/[id].vue`):

```mermaid
sequenceDiagram
  participant V as Visitor (no account)
  participant N as Nuxt (SSR)
  participant DB as Postgres
  participant R2 as Cloudflare R2
  V->>N: GET /t/:id
  N->>DB: get_shared_track(id) as anon
  DB-->>N: shareable fields (no row if private)
  N-->>V: HTML: title, cover, lyrics + og: meta tags
  Note over V: after hydration the player cues the track
  V->>N: GET /api/shared/:id/playback
  N->>DB: get_shared_track(id)
  N-->>V: presigned GET URL (6 hours)
  V->>R2: streaming (range requests)
```

**A shared playlist** (`pages/p/[id].vue`) works the same way through `get_shared_playlist(id)` and `get_shared_playlist_tracks(id)`. The first track is cued on load; the page shows the list, the waveform and, beside them, the lyrics and description of the track being played. Audio comes from `GET /api/shared/playlists/:id/tracks/:trackId/playback`, which signs **only tracks that belong to that shared playlist**.

- **Only shareable fields leave the database.** Other people cannot read the `tracks` or `playlists` tables at all. The `get_shared_*` functions (security definer) return title, composers, album, year, genre name, description, lyrics, peaks and duration — never the Suno prompt, the mastering status or the owner (checked by pgTAP tests).
- **Private tracks inside a shared playlist** can be heard through that playlist only: their own `/t/` link still answers `404`, and their audio is signed only via the playlist's id. The playlist editor warns how many private tracks are included.
- **Link previews.** The pages set `og:title`, `og:description`, `og:image` and `robots`. The image points to `/api/shared/…/cover`, a stable address that redirects to a fresh signed URL (previews are cached for a long time; signed URLs expire). A playlist without a custom cover uses its first track cover.
- **Revoking.** Making an item private closes its page immediately (the next request answers `404`); an audio URL already handed out keeps working until it expires, at most 6 hours.
- **Leaving a public page** stops its music: it is the only place that controls it.

### 7.14 Where each piece of data lives

| Data | Stored in | Who reads it |
|---|---|---|
| Accounts, sessions | Supabase Auth | Supabase; the session JWT in browser cookies |
| Track metadata, lyrics, peaks, visibility | Postgres `tracks` | Owner (RLS); shareable fields via `get_shared_*` |
| Genres | Postgres `genres` (built-in + custom) | Everyone (built-in), owner (custom) |
| Playlists and their order | Postgres `playlists`, `playlist_tracks` | Owner (RLS); shared ones via `get_shared_playlist*` |
| Audio files | Cloudflare R2 (`<userId>/<trackId>.<ext>`) | Anyone holding a presigned URL, issued by the server |
| Covers | Supabase Storage `covers` (private) | Anyone holding a signed URL, issued under the storage policies |
| Volume | Browser `localStorage` (`chronoplayer:volume`) | That browser only |
| Play queue (track ids, current track, position) | Browser `localStorage` (`chronoplayer:queue`) | That browser, for the signed-in user only |
| R2 credentials | Server environment only | The server |

---

## 8. Data model and security

### 8.1 Entities

```mermaid
erDiagram
  AUTH_USERS ||--o{ TRACKS : owns
  AUTH_USERS ||--o{ GENRES : "creates (custom)"
  GENRES |o--o{ TRACKS : classifies
  AUTH_USERS ||--o{ PLAYLISTS : owns
  PLAYLISTS ||--o{ PLAYLIST_TRACKS : contains
  TRACKS ||--o{ PLAYLIST_TRACKS : "appears in"

  TRACKS {
    uuid id PK
    uuid user_id FK
    text title "1-200 chars"
    text composers
    uuid genre_id FK
    smallint year "1000-9999"
    text album
    text description
    text suno_prompt "never shared"
    boolean mastered "never shared"
    enum visibility "private | unlisted | public"
    text lyrics
    jsonb lyrics_synced "[{time, text, section?}]"
    boolean has_lyrics "generated"
    boolean has_synced_lyrics "generated"
    text audio_path "userId/trackId.ext, unique"
    text cover_path "userId/trackId.webp"
    text mime_type
    bigint size_bytes
    real duration_seconds
    jsonb peaks "1000 values 0..1"
    timestamptz created_at
    timestamptz updated_at "trigger"
  }
  GENRES {
    uuid id PK
    uuid user_id FK "NULL = built-in"
    text name "unique per owner, case-insensitive"
  }
  PLAYLISTS {
    uuid id PK
    uuid user_id FK
    text title
    text description
    enum visibility "private | unlisted | public"
    text cover_path "userId/playlists/playlistId.webp"
    timestamptz created_at
    timestamptz updated_at "trigger"
  }
  PLAYLIST_TRACKS {
    uuid playlist_id PK, FK "cascade"
    uuid track_id PK, FK "cascade"
    integer position
  }
```

Constraints worth knowing: file paths must start with the owner's id; the owner of a track or playlist can never change (trigger); a track appears at most once per playlist; deleting a user deletes everything they own.

### 8.2 Migrations

Applied in order from `supabase/migrations/`. An applied migration's statements are never edited: later migrations alter what earlier ones created.

| File | Content |
|---|---|
| `20261018000000_schema.sql` | Visibility enum; `genres` and `tracks`; constraints, indexes, `updated_at` and owner-change triggers; 26 built-in genres |
| `20261018000100_rls.sql` | RLS on `genres` and `tracks`; first version of `get_shared_track` |
| `20261018000200_storage.sql` | Private buckets `covers` (10 MB, images) and `audio` (500 MB, used locally only); storage policies; `is_shared_track_file` |
| `20261020000000_grants.sql` | Explicit table privileges for `anon` and `authenticated` (independent of the project's default grants) |
| `20261021000000_public_sharing.sql` | `tracks` becomes owner-only; `get_shared_track` returns shareable fields only |
| `20261022000000_playlists.sql` | `playlists`, `playlist_tracks`, their RLS; `set_playlist_tracks`; `get_shared_playlist(_tracks)`; storage sharing extended to playlists |

### 8.3 Database functions

| Function | Security | Purpose |
|---|---|---|
| `get_shared_track(id)` | definer | Shareable fields of a non-private track (nothing for private ones) |
| `get_shared_playlist(id)` | definer | A non-private playlist's title, description, cover, visibility |
| `get_shared_playlist_tracks(id)` | definer | Shareable fields of every track of a non-private playlist, in order (private tracks included) |
| `is_shared_track_file(bucket, path)` | definer | Storage policy helper: the file belongs to a non-private track, to a track in a non-private playlist, or is a non-private playlist's cover |
| `set_playlist_tracks(id, ids[])` | invoker | Replaces a playlist's tracks in one transaction (RLS applies) |
| `owns_playlist(id)` | invoker | RLS helper for `playlist_tracks` |
| `set_updated_at()` · `prevent_owner_change()` | trigger | Timestamps · immutable owner |

*Security definer* functions bypass RLS, so each one filters on visibility itself and selects explicit columns; all have an empty `search_path`.

### 8.4 Storage

| Bucket | Where | Content | Access |
|---|---|---|---|
| `covers` | Supabase Storage (private) | `<userId>/<trackId>.webp`, `<userId>/playlists/<playlistId>.webp` | Write: own folder only. Read (sign): own files, or files of shared items |
| `chronoplayer-audio` | Cloudflare R2 (private) | `<userId>/<trackId>.<ext>` | Only through presigned URLs issued by the server |
| `audio` | Local Supabase only | Same layout as R2 | Stand-in for R2 in development (S3 protocol) |

### 8.5 Security guarantees

Verified by the pgTAP tests (`supabase/tests/database/`), plus unit and end-to-end tests:

- A user reads, changes and deletes only their own tracks, genres and playlists. Nobody can create items for someone else or change an item's owner.
- Playlists can only contain the owner's own tracks.
- Anonymous visitors cannot read any table; they can only call the `get_shared_*` functions, which return nothing for private items and never the Suno prompt, the mastering status or the owner.
- A private track inside a shared playlist is reachable only through that playlist.
- Files can be uploaded only into one's own folder, and read only when they are one's own or belong to shared items.
- Every bucket is private: files are reachable only through expiring signed URLs. The R2 keys exist only on the server.
- The public Supabase key (`SUPABASE_KEY`) can live in the browser: protection comes from the policies, not from hiding the key. The service key is never used.
- API errors never include SQL messages or stack traces (logged server-side only).

---

## 9. API reference

All routes live in `server/api/`. **Auth:** every route requires a session cookie (`401` otherwise), except `/api/health` and `/api/shared/**`. **Errors:** JSON `{ statusCode, message }`; validation errors are `400` with per-field `data.issues`; an item that is missing, private or someone else's is always `404`. Types: `shared/types/*.ts`; request bodies: `shared/schemas/*.ts`.

**Tracks and genres**

| Method | Path | Body | Response |
|---|---|---|---|
| `GET` | `/api/health` | | `{ status, time }` (public) |
| `GET` | `/api/tracks` | | `TrackSummary[]`, newest first |
| `POST` | `/api/tracks/upload-url` | `{ trackId, extension, mimeType, sizeBytes }` | `AudioUploadTarget` (PUT URL, 1 hour) |
| `POST` | `/api/tracks` | `trackCreateSchema` | `201 TrackDetail` |
| `GET` | `/api/tracks/:id` | | `TrackDetail` |
| `PATCH` | `/api/tracks/:id` | any subset of `trackMetadataSchema`, `coverPath` | `TrackDetail` |
| `DELETE` | `/api/tracks/:id` | | `204` |
| `GET` | `/api/tracks/:id/playback` | | `PlaybackSource { url, expiresAt }` (6 hours) |
| `GET` | `/api/genres` | | `Genre[]` |
| `POST` | `/api/genres` | `{ name }` | `Genre` (existing one if the name is taken) |
| `GET` | `/api/storage` | | `StorageReport`: usage (audio, covers) and orphaned files |
| `DELETE` | `/api/storage/orphans` | | `StorageCleanupResult`: deletes the orphans older than the minimum age |

**Playlists**

| Method | Path | Body | Response |
|---|---|---|---|
| `GET` | `/api/playlists` | | `PlaylistSummary[]`, newest first |
| `POST` | `/api/playlists` | `{ title, description?, visibility?, trackIds? }` | `201 PlaylistDetail` |
| `GET` | `/api/playlists/:id` | | `PlaylistDetail` |
| `PATCH` | `/api/playlists/:id` | any subset of `{ title, description, visibility, coverPath }` | `PlaylistDetail` |
| `DELETE` | `/api/playlists/:id` | | `204` (tracks stay in the library) |
| `PUT` | `/api/playlists/:id/tracks` | `{ trackIds }` (full ordered list) | `PlaylistDetail` |
| `POST` | `/api/playlists/:id/tracks` | `{ trackIds }` (to append) | `PlaylistDetail` |

**Public (no sign-in)**

| Method | Path | Response |
|---|---|---|
| `GET` | `/api/shared/:id` | `SharedTrack` |
| `GET` | `/api/shared/:id/playback` | `PlaybackSource` |
| `GET` | `/api/shared/:id/cover` | `302` to a fresh signed cover URL |
| `GET` | `/api/shared/playlists/:id` | `SharedPlaylist` (all tracks, shareable fields) |
| `GET` | `/api/shared/playlists/:id/tracks/:trackId/playback` | `PlaybackSource`, only for tracks of that playlist |
| `GET` | `/api/shared/playlists/:id/cover` | `302` to the custom cover, or the first track cover |

---

## 10. Configuration

### 10.1 Environment variables

| Variable | Used by | Description |
|---|---|---|
| `SUPABASE_URL` | browser + server | Supabase project URL (local: `http://127.0.0.1:54321`) |
| `SUPABASE_KEY` | browser + server | **Public** key (publishable / anon) |
| `NUXT_AUDIO_STORAGE_ENDPOINT` | server only | S3 endpoint: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` in production, `http://127.0.0.1:54321/storage/v1/s3` locally |
| `NUXT_AUDIO_STORAGE_REGION` | server only | `auto` for R2, `local` locally |
| `NUXT_AUDIO_STORAGE_BUCKET` | server only | `chronoplayer-audio` on R2, `audio` locally |
| `NUXT_AUDIO_STORAGE_ACCESS_KEY_ID` | server only | R2 API token key id |
| `NUXT_AUDIO_STORAGE_SECRET_ACCESS_KEY` | server only | R2 API token secret — **never commit it** |
| `NUXT_STORAGE_CLEANUP_MIN_AGE_HOURS` | server only, optional | Orphaned files younger than this are never deleted (default `24`; the e2e server uses `0`) |

In the Docker mode the Supabase variables are named `NUXT_PUBLIC_SUPABASE_URL` / `NUXT_PUBLIC_SUPABASE_KEY` (runtime overrides of the build-time values). A missing audio storage variable makes audio routes answer `500 Audio storage is not configured` and logs which one is missing.

### 10.2 Env files

| File | Git | Written by | Used by |
|---|---|---|---|
| `.env` | ignored | `pnpm local`, `pnpm env:local` | `pnpm dev`, e2e tests (`node --env-file=.env`) |
| `.env.docker` | ignored | `pnpm docker` | The app container (`compose.yaml`) |
| `.env.r2` | ignored | you, from `.env.r2.example` | `pnpm r2:check` |
| `.env.example` · `.env.r2.example` | committed | — | Templates with explanations |

`writeEnvFile` only updates the variables it manages: other lines you add to `.env` are kept.

### 10.3 Notable `nuxt.config.ts` settings

- `routeRules`: rendering modes ([5.4](#54-rendering-modes)) and `no-store` on `/api/**`.
- `runtimeConfig.audioStorage`: server-only audio storage settings, filled from `NUXT_AUDIO_STORAGE_*`.
- `runtimeConfig.storageCleanup.minAgeHours`: minimum age of a deletable orphan (24 h).
- `supabase.redirectOptions`: login at `/login`, callback at `/confirm`, public pages excluded; `types` points to the generated database types.
- `build.transpile: ['pinia']`: one copy of Pinia in the server bundle (without it, server-rendered pages failed with "no active Pinia").
- `vite.worker.format: 'es'`: the FLAC worker is an ES module worker.
- `typescript.appTsConfig.vueCompilerOptions.checkUnknownComponents`: a misnamed component is a type error.
- `pwa`: manifest and a Workbox service worker that caches static assets only (audio and covers come from signed URLs).
- `app/assets/css/main.css`: base font size 125% (20 px), 118.75% while the full-screen player is open.

---

## 11. Local development in detail

### 11.1 Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | **24.11+** (or 22.21+) | `.nvmrc` pins 24; older versions make Nuxt print a warning |
| pnpm | 12 | `corepack enable` or `npm i -g pnpm`; pinned in `packageManager` |
| Docker Desktop | recent | Runs the local Supabase stack (and the app in Docker mode) |
| GNU Make | optional | Ships with Git Bash on Windows; every target has a `pnpm` equivalent |

The Supabase CLI is a dev dependency: no global install needed. pnpm keeps its package store in the project (`.pnpm-store/`, git-ignored, see `pnpm-workspace.yaml`); `node_modules` holds hard links to it, so the space is not used twice even if Explorer counts it twice.

### 11.2 Step by step (what `pnpm local` automates)

```bash
pnpm install
pnpm db:start        # first time: pulls the Supabase Docker images (a few minutes)
pnpm env:local       # writes .env from `supabase status`
pnpm db:types        # optional: regenerate database types
pnpm dev             # http://localhost:3000
```

or `make setup` followed by `make dev`.

### 11.3 How the Docker mode works

Supabase always runs in the containers managed by the Supabase CLI. `pnpm docker` builds the app image from the `Dockerfile` (multi-stage: dependencies and build in the first stage, only the self-contained `.output/` in the final `node:24-alpine` image, run as the unprivileged `node` user, with a health check on `/api/health`) and starts it with `compose.yaml` on port 8080.

Inside a container `127.0.0.1` is the container itself, so the app reaches Supabase through `host.docker.internal`. Docker Desktop maps that name on the host too, so the browser and the server use the same URLs, including the presigned audio URLs. The script writes them to `.env.docker`. The image is rebuilt on every `pnpm docker` (the pnpm store is a build cache, so rebuilds are fast).

### 11.4 Local services

| Service | URL |
|---|---|
| App (dev) · App (Docker) | http://localhost:3000 · http://localhost:8080 |
| Supabase API | http://127.0.0.1:54321 |
| Supabase Studio (tables, users, files, SQL editor) | http://127.0.0.1:54323 |
| Mailpit (emails sent by local Auth) | http://127.0.0.1:54324 |
| Postgres (direct) | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |

`pnpm db:status` prints all URLs and keys.

### 11.5 Local data

- Data survives `pnpm stop` and restarts: it lives in Docker volumes.
- The **demo user** (`demo@chronoplayer.local` / `chronoplayer`) is created by `supabase/seed.sql` when the database is first created or reset.
- **New migrations: `pnpm db:migrate`** (or `make db-migrate`) applies them and keeps every account and track. `pnpm db:reset` rebuilds the database from scratch and **deletes all local data** — use it only when you mean it.
- Local and production data are separate (see [5.3](#53-where-everything-runs)).

---

## 12. Testing

| Level | Tool | Where | What it covers |
|---|---|---|---|
| Unit | Vitest (Node) | `test/unit/` | LRC parsing and serialization, active-line lookup, peaks, paths, formats, cover crop geometry, Zod schemas, mappers; **services** (tracks, genres, playlists, sharing, storage clean-up) with mocked repositories; the **R2 client** (incl. paginated listing) with a fake fetch; the **player store** with a fake engine (queue and queue editing, races, expired URLs, shared sources); **WAV → FLAC** with real libFLAC round trips (8/16/24-bit, mono/stereo, full-scale extremes) checked by a second, independent decoder and Node's MD5 |
| Components | Vitest + `@nuxt/test-utils` (happy-dom) | `test/nuxt/` | `LyricsView`, `TrackCover`, `TrackList`, `PlaylistCover` |
| Scripts | Vitest (Node) | `test/unit/scripts/` | **`merge:main`** run against throwaway git repositories (a bare repository as the remote): merge and clean-up, every refusal, conflicts; the merge message |
| Database | pgTAP (`supabase test db`) | `supabase/tests/database/` | RLS across two users and an anonymous visitor, table privileges, constraints, generated columns, sharing functions (fields never exposed), playlists, storage policies — 52 tests |
| End-to-end | Playwright (Chromium) | `test/e2e/` | Sign-in/up/out and protected pages; real upload of a 24-bit WAV that must come back from storage as a FLAC with exactly the original samples; float WAV kept; playback, editing, cover, LRC, sync tools, full-screen view, deletion; **track sharing** (no account needed, nothing private leaks, `404` once private); **playlists** (create, add, reorder and reload, play all, share, private tracks only inside the playlist); **queue** (add, play next, move, remove, play now, clear) and **saved queue** (a reload resumes track, position and queue; closing the player forgets it); **storage clean-up** (an interrupted upload is found and deleted, the real track keeps its file); **cover cropping** (the stored WebP holds exactly the chosen square, checked on its pixels) |

```bash
make test                 # unit + components (seconds)
make db-test              # database (local Supabase running)
make test-e2e             # end-to-end on a production build (:3100) + local Supabase
E2E_DEV=1 pnpm test:e2e   # end-to-end against the dev server (:3000)
make ci                   # everything the CI runs
```

- E2E tests generate WAV files on the fly and register throwaway users (`e2e-…@chronoplayer.test`) in the local database; they do not touch your own data.
- pgTAP tests run inside a transaction that is rolled back: they never change the database.
- Locally Playwright reuses a server already running on :3100 — stop it first, or it may test an old build.
- **CI** (`.github/workflows/ci.yml`): job 1 runs lint, typecheck and Vitest; job 2 starts a trimmed Supabase in the runner and runs `db:lint`, pgTAP and Playwright, uploading the report on failure.

---

## 13. Deployment (Supabase + Cloudflare R2 + Vercel)

### 13.1 Supabase Cloud

1. Create a project on [supabase.com](https://supabase.com) (free plan). Keep the Data API enabled.
2. Link it and apply the migrations:
   ```bash
   pnpm exec supabase login
   make db-link ref=<project-ref>      # the ref is in the dashboard URL
   make db-push
   pnpm exec supabase migration list --linked   # every migration Local = Remote
   ```
   `seed.sql` (demo user) is **not** applied in production.
3. Copy the *Project URL* and the *publishable key* (Project Settings → API).
4. Storage needs no setup: the migrations create the `covers` bucket and its policies. Only small WebP covers are stored here, so the 50 MB per-file limit of the free plan does not matter.

### 13.2 Cloudflare R2 (audio files)

Dashboard labels may change slightly over time.

1. **R2 Object Storage**: enable R2 (Cloudflare may ask for a payment method even within the free tier).
2. **Create bucket** `chronoplayer-audio`, location *Automatic*, storage class *Standard*. Keep public access **disabled**.
3. **Bucket → Settings → CORS policy** (the browser uploads with PUT and streams with GET + `Range`):
   ```json
   [
     {
       "AllowedOrigins": ["http://localhost:3000", "https://<your-domain>"],
       "AllowedMethods": ["GET", "HEAD", "PUT"],
       "AllowedHeaders": ["content-type", "range"],
       "ExposeHeaders": ["ETag", "Content-Length", "Content-Range", "Accept-Ranges"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```
   Origins must include the scheme (`https://`) and no trailing slash.
4. **Manage API tokens → Create API token**: permission *Object Read & Write*, restricted to `chronoplayer-audio`. Copy the *Access Key ID*, the *Secret Access Key* (shown once) and the S3 endpoint `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`. The "Token value" is not needed.
5. Copy `.env.r2.example` to `.env.r2`, fill it in and run `pnpm r2:check`: every line must be ✔.

### 13.3 Vercel

1. Import the GitHub repository: the Nuxt preset is detected automatically.
2. *Environment Variables*: `SUPABASE_URL`, `SUPABASE_KEY` and the five `NUXT_AUDIO_STORAGE_*` values from `.env.r2`.
3. *Settings → Node.js Version* (under "Build and Deployment" or "General", depending on the dashboard version): 24.x.
4. pnpm is pinned in `packageManager`; if Vercel does not pick it up, add `ENABLE_EXPERIMENTAL_COREPACK=1`.
5. Deploy and open `https://<your-domain>/api/health`. Every push to `main` deploys again automatically.

### 13.4 After the first deploy

1. Supabase → **Authentication → URL Configuration**: *Site URL* `https://<your-domain>`, *Redirect URLs* `https://<your-domain>/confirm`.
2. Add `https://<your-domain>` to the R2 CORS origins (if not done yet) and run `pnpm r2:check https://<your-domain>`.
3. **Personal use:** create your account from the Supabase dashboard (Authentication → Users → Add user, *Auto Confirm User*), then turn off **Allow new users to sign up** (Authentication → Sign In / Providers). Nobody else can then create an account; shared links keep working without one.
4. Upload a track online and open it in a private window via its share link.

### 13.5 Updating production

- **Code only:** commit and push to `main`; Vercel deploys.
- **With a new migration:** `make db-push` first (so the new code finds the new schema), then commit and push. Vercel never touches the database.
- Writing a migration: `make db-migration name=<description>` → write the SQL → `make db-migrate` → `make db-test` → `make db-types`.

---

## 14. Development conventions

### 14.1 Git workflow

Every task gets its own branch from `main`, with a short English name and a type prefix: `feat/editable-queue`, `fix/cover-upload`, `docs/readme`, `chore/merge-command`.

```bash
git switch main && git pull
git switch -c feat/<name>
# … work, commit, push …
git push -u origin feat/<name>     # Vercel builds a preview deployment of the branch
pnpm merge:main                    # or: make merge
```

`pnpm merge:main` (`scripts/merge-main.mjs`):

| Situation | What happens |
|---|---|
| You are on `main` | "Already on main", nothing else |
| Uncommitted changes | Stops: commit (and push) or stash them first |
| The branch was never pushed, or has local commits not pushed | Stops: push first |
| GitHub has commits on the branch you don't have | Stops: pull first |
| Your local `main` has unpushed commits | Stops |
| Nothing new compared to `main` | Stops |
| Ready | Shows the commits and the merge message, asks `[y/N]` (`--yes` skips the question) |
| Confirmed | Updates `main`, merges with a merge commit (`--no-ff`), pushes `main` (production deploy on Vercel), deletes the branch on GitHub and locally, leaves you on `main` in sync |
| Merge conflicts | The merge is aborted and you are back on your branch, unchanged: merge `main` into it, fix, push, run again |
| Pushing `main` fails | The merge stays local and the branch is kept; run `git push` on `main` |

The merge commit message sums up the branch: the commit subject when there is a single commit (`Merge feat/x: Add an editable play queue`), otherwise `Merge feat/x (N commits)` followed by one line per commit, oldest first, with repeated subjects grouped.

R2 accepts uploads only from the origins in its CORS policy: uploads from a Vercel **preview** URL fail unless that origin is added too. Playback and everything else work on previews.

### 14.2 Code conventions

- **Language:** everything in the repository is in English (code, comments, docs, UI text, commit messages).
- **Comments:** every file starts with what it is for; functions document their contract and the reasons behind non-obvious choices.
- **Style:** ESLint with stylistic rules, no Prettier (2 spaces, no semicolons, single quotes). `make lint-fix` fixes what it can; VS Code fixes on save (`.vscode/settings.json`).
- **Components:** Nuxt prefixes a component with its folder (`components/track/TrackCover.vue` → `<TrackCover>`); files already carry the full name, and the typecheck flags unknown components.
- **New endpoint:** a route in `server/api/` only authenticates (`requireAuth`, or `visitorClient` for public routes), validates (`readValidated`, `requireUuidParam`) and calls a service. Rules live in the service, tested without Nuxt; queries in a repository; conversions in a mapper.
- **New table or column:** migration (RLS policies + explicit `grant`s) → `make db-migrate` → pgTAP tests → `make db-types` → mapper → repository → service → route → `app/services/api.ts`.
- **Shared code:** anything both sides need goes in `shared/` (pure code: no browser or Node APIs).
- **Never** use the Supabase service key in the app, and never put storage credentials in client code or in git.

---

## 15. Known limitations and next steps

- **The queue is per device:** it is saved in the browser, not in the account.
- **Storage clean-up is manual** (Storage dialog): nothing removes orphaned files on a schedule.
- **Cover URLs change on every load** (signed URLs), so the browser cannot cache covers across visits.
- **No library pagination:** everything loads at once, fine up to a few hundred tracks.
- **No offline mode** (downloading tracks for listening without a connection).
- **Tags are not written into files** on export.
- **Revoked links:** an audio URL already handed out stays valid until it expires (up to 6 hours).

---

## 16. Troubleshooting

| Problem | Solution |
|---|---|
| `Current version of Node.js … is unsupported` | Upgrade Node to 24.11+ (`nvm install 24`) |
| "Docker is not running" | Open Docker Desktop and wait for the engine; if it hangs while starting, use **Restart** from its tray menu |
| `supabase start` fails | Docker must be running; `pnpm db:stop`, then try again |
| Always sent back to `/login` locally | `.env` missing or stale: `make env`, then restart the dev server |
| `pnpm docker`: the app cannot reach Supabase | Docker Desktop must map `host.docker.internal` (Settings → General → "Add the *.docker.internal names to the host's /etc/hosts file") |
| Forgot the local login | Use the demo account, or look at Authentication → Users in Studio (http://127.0.0.1:54323) |
| `Failed to load because no supported source was found` | The audio URL could not be loaded (expired or wrong storage settings): press play again; if it persists check the `NUXT_AUDIO_STORAGE_*` values |
| `Audio format not supported` | The browser lacks that codec (e.g. some OGG files on older Safari). The file stays saved. |
| `Audio storage is not configured` (HTTP 500) | A `NUXT_AUDIO_STORAGE_*` variable is missing (Vercel settings, or `make env` locally) |
| Upload fails online with a CORS error | Add the site's origin (with `https://`) to the R2 CORS policy, then `pnpm r2:check https://<your-domain>` |
| R2 says "JSON not well formatted" when saving CORS | Paste exactly the JSON array of 13.2, with straight quotes |
| Sign-up email link leads to localhost | Set Site URL and Redirect URLs in Supabase (13.4) |
| A share link answers "not available" | The item is private (or the saved visibility is still private): set Unlisted/Public and **save** |
| Database types out of date | `make db-types` after every migration |
| First page load in `make dev` is very slow | Expected: Vite compiles dependencies on the first request |
| E2E tests test an old version | A server is still running on :3100: stop it, Playwright then builds afresh |
| `git commit`: "Permission denied" on Windows | An antivirus may lock files in `.git`: add the project folder to its exclusions |
| `make` not found on Windows | Use Git Bash, or the equivalent `pnpm` commands |
