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
| **Library** | Track list with cover, composers, duration, genre, mastering status, synced-lyrics and visibility badges, and a **Draft** badge on work-in-progress versions. Search (title, composers, album), genre, mastering and version (final / drafts) filters, sorting. **Select** mode: tick several tracks to mark them final, add them to a playlist, share them for feedback or delete them in one go. Clicking a track's name plays it; clicking the name of the track already in the player opens the full-screen view. |
| **Upload** | Drop several files at once (MP3, WAV, FLAC, AAC/M4A, OGG/Opus, WebM; max 500 MB each). Title, composers, album, year, genre, lyrics (synced ones too) and cover are read from the tags. **WAV files are converted to FLAC losslessly**, verified bit for bit ([7.4](#74-lossless-wav--flac-conversion)). Direct upload to storage with a progress bar, retried on network errors. |
| **Player** | Bottom bar that stays visible across pages: on phones cover, title, play and next; from tablet width the waveform sits above the controls in the middle of the bar (the same order as the full-screen view), between the track and the volume. Clickable and draggable waveform, elapsed and remaining time, play/pause, stop, previous/next, **shuffle** and **repeat** (off / all / one), volume and mute (volume, shuffle and repeat are remembered). Lock-screen and media-key controls (Media Session). On tablets the volume is a speaker button with the slider in a popover; on iPhone and iPad, where only the hardware buttons can change the volume, the player shows mute alone. **Touch gestures** on the bar's track area: swipe left for the next track, right for the previous one, up for the full-screen view. Playback goes on with the screen off; the lock screen and the media notification show the track (cover, title, composers) or, where it has none, the app's icon and name. **Cast** to a TV or speaker on the Wi-Fi network (Chromecast / Google TV from Android, AirPlay from iPhone and iPad): the button is always there on phones and tablets (a tap searches the network), and on a desktop appears when a device is around. Bluetooth speakers and headphones need nothing from the app: the phone sends all its audio there. |
| **Queue** | "Play next" and "Add to queue" in every track menu (library and playlists). The **Up next** panel (from the player bar, or the full-screen view on phones) shows the track playing and the upcoming ones: drag to reorder (mouse or touch), move up/down, remove, play one right away, clear. The queue is **saved on the device**: after a reload you find the same queue and track, paused where you left it. |
| **Full-screen player** | Large cover, waveform, controls and **synced lyrics**: the active line is highlighted, the text scrolls by itself, clicking a line seeks there. Section headers (`[Verse 1]`, `[Chorus]`) are shown as titles. On touch screens, **pull it down to close** it. On phones the lyrics have **a view of their own**: the normal view shows cover, info, waveform, controls and the track's **description**; the **Lyrics** button of its top bar swaps them for a small cover and title, the lyrics filling the screen (bigger, scrolling in their own box) and the waveform with previous / play / next at the bottom; while it plays there, the **screen stays on**. The choice is remembered on the device. |
| **Editor** | Title, composers, album, year, genre (built-in, or custom ones created on the fly), description, Suno prompt, mastered yes/no, draft/final version, visibility (private / unlisted / public), cover (you choose the square in a crop editor — drag, zoom with wheel/pinch/slider — then it is converted to WebP), lyrics with section headers. |
| **Lyrics sync** | "Tap to sync": while the track plays, press <kbd>Space</kbd> (or tap **Stamp line**) at the start of each line; on phones Stamp line and Undo stay pinned above the player bar, each tap gives a short **vibration** (Android), and the **screen stays on** while syncing. Playback at 0.5× / 0.75× with the pitch preserved, a zoomable detailed waveform with a **draggable marker per line**, replay of the selected line (<kbd>R</kbd>), ±0.05 s nudges (<kbd>←</kbd> <kbd>→</kbd>), undo (<kbd>↑</kbd>), **LRC** import (paste or open an `.lrc` file) and export (copy or download `.lrc`). All manual: no automatic alignment. |
| **Draft versions** | New uploads are **drafts** (e.g. one of several Suno versions of a song); the chosen one is marked **final** (track menu, edit page, or several at once). Select 2-3 drafts → **Share for feedback** creates an unlisted **group of versions** ("Night drive – versions") and copies its link: friends hear every version in a row, marked **Work in progress**. Friends **pick their favourite** with a heart, optionally with their name and a comment, no account needed. Groups have their own **Versions** page, apart from the playlists: open one to see the **votes, plays and comments** per version, copy its link again or mark the chosen version final, which **closes the voting**. Then delete the others in one go ([7.17](#717-draft-versions-and-feedback)). |
| **Playlists** | Ordered lists of your tracks (groups of versions are on the Versions page instead). Create them from the Playlists page or from a track's menu ("Add to playlist" → "New playlist…"), reorder by dragging (mouse or touch) or with Move up/down, remove tracks, play them in sequence. Cover: an automatic 2×2 mosaic of the first tracks' covers, or an image you upload. |
| **Download** | "Download" in the track menus and on the edit page saves the audio file **with its metadata written in**: title, composers (as artist and composer), album, year, genre, description (as comment), lyrics, **synced lyrics** and cover. FLAC and MP3 get every field; WAV the text fields; other formats are saved as stored. The audio itself is untouched, and the Suno prompt and mastering status are never written. |
| **Sharing** | Unlisted and public **tracks** get a public page, `/t/<track id>`: cover, title, composers, album, year, genre, description, lyrics and a player. Shared **playlists** get `/p/<playlist id>`: the track list, sequential playback, and the lyrics and description of the track being played. No account needed to open them. "Copy share link" in the menus and on the edit pages; on phones and tablets it is **"Share link"** and opens the device's share sheet (WhatsApp, Telegram, mail…). The Suno prompt and the mastering status are **never** shared. **Sharing a playlist shares all its tracks, private ones included** (only inside the playlist; the editor warns about them). Link previews in chat apps and social networks show the title and the cover. |
| **Statistics** | Account menu → Statistics: how many times your **share links** (`/t/…`, `/p/…`) were opened in the last 7 or 30 days, per day and per track or playlist, with where visitors came from (WhatsApp, Instagram…), their country and device: real data from **Vercel Web Analytics** on the deployed site, clearly flagged **demo data** locally. Next to them, how many times visitors really **listened** (30 seconds, or half a shorter track) and how many **to the end**, counted by the app itself, so real everywhere; **your own plays** are shown apart and never inflate the numbers ([7.16](#716-statistics)). |
| **Storage** | Account menu → Storage: how much audio and how many covers you store, and the **orphaned files** left by interrupted uploads, which can be deleted in one click (files younger than 24 hours are kept: an upload may still be in progress). |
| **Interface** | Responsive from phones to desktop, light and dark theme, checked by end-to-end tests at phone and tablet size. Slightly smaller text on phones (17 px instead of 20 px), so lists, filters and headers fit; there the track editor's Play, Download and Save are icons, leaving the row to the title. On touch screens the play button on track covers is always shown (there is no hover to reveal it). The **Android back button** closes the panel or dialog on top (full-screen player, Up next, dialogs) instead of leaving the page or the installed app. **Every icon-only button shows its name in a tooltip** on hover or keyboard focus (the same words screen readers announce); the drag grips say "Drag to reorder". |
| **PWA** | Installable on phones and desktop (manifest, icons, service worker for static assets). |

**No AI.** The app uses no artificial-intelligence service, SDK or model. The "Suno prompt" field is just a text field to note down the prompt used elsewhere.

---

## 2. Quick start

**Prerequisites:** Node.js 24.11+ (or 22.21+), pnpm 12, Docker Desktop (running). Details in [11.1](#111-prerequisites). **Setting up a new computer (macOS or Windows)?** Run `node scripts/doctor.mjs` and follow the [checklist from a blank computer](#from-a-blank-computer): it covers every step that is easy to forget.

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
| Check a new computer's prerequisites | `node scripts/doctor.mjs` (or `pnpm doctor`, `make doctor`), see [11.1](#from-a-blank-computer) |

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
| `pnpm doctor` | Check this computer's prerequisites (Node, pnpm, Docker, dependencies, `host.docker.internal`, Playwright's Chromium, Make, local stack) and print the fix for each missing one, on macOS, Windows or Linux. Read-only; works before `pnpm install` as `node scripts/doctor.mjs` |
| `pnpm merge:main [--yes]` | Merge the current (pushed) branch into `main`, push, delete the branch locally and on GitHub, end on an up-to-date `main` ([14.1](#141-git-workflow)) |

### 3.3 Makefile

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
| `make check` | lint + typecheck + test: quick checks before a commit |
| `make ci` | Everything the CI runs (adds `db-lint`, `db-test`, `test-e2e`) |
| `make doctor` | `pnpm doctor` |
| `make merge` · `make merge yes=1` | `pnpm merge:main`: merge the current branch into `main` and clean up · without the confirmation question (make cannot take `--yes`: it would read it as its own option) |
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
| Tag writing | **browser-id3-writer 6** (MP3) + own FLAC and WAV writers | Tags written into downloaded files, in the browser |
| WAV → FLAC | **libflacjs** (libFLAC 1.3.4, WebAssembly) + **hash-wasm** (MD5) | Reference encoder in a Web Worker, verified bit for bit |
| Validation | **Zod 4** | The same schemas for client forms and API bodies |
| Visit statistics | **Vercel Web Analytics** (`@vercel/analytics`) | Cookieless page-view counting on the share pages, read back through its REST API |
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
  Repos -- "cover files (owner)<br/>signed URLs (public pages)" --> Storage
  Repos -- "presigned URLs (S3 API)" --> R2
  Flac -- "direct upload<br/>(presigned PUT)" --> R2
  Engine -- "streaming address<br/>(/api/stream: HEAD answered, GET redirected)" --> API
  Engine -- "streaming<br/>(presigned GET, range requests)" --> R2
```

### 5.2 Key principles

1. **Large files never go through the app server.** Vercel functions accept requests of about 4.5 MB, while a FLAC weighs 30-50 MB. The browser uploads audio straight to R2 and covers straight to Supabase Storage, and streams audio from presigned URLs (the app's streaming address only redirects to them, [7.7](#77-expired-streaming-urls)). The server only handles small JSON payloads, signs URLs and serves the owner's covers (small WebP images, so the browser can cache them: [7.2](#72-loading-the-library)); storage credentials never leave it.
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
| `/`, `/tracks/**`, `/playlists`, `/playlists/**`, `/versions`, `/versions/**`, `/stats` | Client only (`ssr: false`) | Personal pages that use browser APIs (Web Audio, files, workers); nothing to gain from SSR |
| `/login`, `/confirm` | Client only | A form submitted before hydration would send the password in the URL (native GET submit) |
| `/t/:id`, `/p/:id` | **Server-rendered** | Link previews (chat apps, social networks) read the HTML: title, description and image must be in it |
| `/api/**` | API, `Cache-Control: no-store` | Responses are personal or contain signed URLs |
| `/api/covers/**` | API, `Cache-Control: private, max-age=31536000, immutable` | Cover images at versioned addresses: each device downloads a cover once ([7.2](#72-loading-the-library)) |

The `@nuxtjs/supabase` route middleware sends signed-out visitors to `/login`, except on `/t/*` and `/p/*`.

Server-rendered pages hand the Pinia state they built to the browser, which applies it to the stores. The player's volume, shuffle and repeat are read from this browser's `localStorage` instead, so they are `skipHydrate` refs: opening `/t/…` and then the library keeps the settings saved on the device.

### 5.5 Reusable building blocks

Logic that more than one page, component or service needs lives in one place. Check here before writing a new helper.

**Shared (`shared/utils`, client and server, auto-imported):**

| Helper | File | What it does |
|---|---|---|
| `pluralize`, `capitalize`, `truncate`, `joinParts`, `foldCase`, `hasText` | `text.ts` | "3 tracks", "Version" from "version", cut texts with "…", "Album · 2026 · Genre" lines, case-insensitive keys (search, genre names), blank-value checks (tag writers, download toast) |
| `clamp` | `numbers.ts` | Volume, speed, seek position, crop geometry |
| `moveItem` | `arrays.ts` | Move inside an ordered list without mutating it (play queue, playlist order) |
| `syncRowsFromLines`, `roundToCentiseconds`, `hasLyrics` | `lyrics.ts` | Sync editor rows from stored or imported lines, LRC precision, "has lyrics to show" (public pages) |
| `WAV_MIME_TYPES` | `audio-files.ts` | The names WAV goes by: FLAC conversion on upload, tagging on download |
| `patchSchemaOf` | `shared/schemas/track.ts` | PATCH body of an item with a cover: tracks and playlists |

**Backend (`server/`):**

| Helper | File | What it does |
|---|---|---|
| `playbackSource`, `expiresIn` | `services/playback.ts` | Streaming address (`/api/stream`, see [7.7](#77-expired-streaming-urls)) with its expiry, for the owner's library and the public pages |
| `removeCoverFiles` | `services/playback.ts` | Best-effort deletion of cover files, skipping items without one |
| `trackCoverUrlOf`, `playlistCoverUrlOf` | `mappers/cover-urls.ts` | Cacheable cover address of a row, or null (mappers, statistics) |
| `toSharedTrackContent` | `mappers/track.ts` | Shareable fields of a track: the public track page and each track of a public playlist |
| `byPosition` | `repositories/playlists.repository.ts` | Playlist order of embedded and RPC rows |
| `badRequest`, `notFound`, `playlistNotFound`, `toHttpError` | `utils/errors.ts` | Consistent HTTP errors |

**Frontend (`app/`):**

| Building block | Kind | Used by |
|---|---|---|
| `useAsyncTask` | composable | Every button that calls the API: a `running` flag for the spinner, failures as an error toast |
| `usePlaylistList(purpose)` | composable | The cached list of playlists or of groups of versions, kept in sync by the pages that change them (`remember`, `forget`) |
| `<PlaylistEditor>`, `<PlaylistGrid>` | components | Owner page and card grid of both purposes: Playlists and Versions |
| `useEditForm` | composable | Track editor, playlist page: form state, "unsaved changes" and the leave-page confirmation |
| `useCoverEditor` + `useCoverStorage` | composables | Cover pickers (crop → WebP → Storage → `PATCH coverPath`), and the covers found in tags during an upload |
| `useSortableList` + `<DragHandle>` | composable + component | Drag and drop of the playlist page and the "Up next" panel |
| `useSharedItem`, `useShareMeta` | composables | Public pages: SSR load with `404`/`500`, link-preview tags |
| `<SharePlayer>`, `<ShareUnavailable>`, `<ShareLinkBox>` | components | Public pages' player and "not available" state; the "Sharing" box of the editors |
| `useQueueActions().menuItems`, `usePlaylists().addToPlaylistMenu` | composables | "Play next / Add to queue" and "Add to playlist" menu entries (library, selection bar, playlist page) |
| `useSignedInRedirect` | composable | Sign-in and confirmation pages: enter the app once a session exists |
| `player.displayTrack` | store getter | What the bar, the full-screen view and the queue show while a track loads |
| `VISIBILITY_INFO`, `VISIBILITY_ITEMS` | `app/utils/visibility.ts` | Labels, explanations and icons of the three visibilities |
| `PLAYLIST_PURPOSE_INFO`, `playlistPath` | `app/utils/playlist-purpose.ts` | Section, address and wording of each playlist purpose ("playlist"/"track", "group"/"version") |
| `copyText` | `app/utils/clipboard.ts` | Clipboard with a fallback (share links, LRC export) |
| `concatBytes`, `asciiAt` | `app/lib/bytes.ts` | WAV parser, FLAC encoder, tag writers, streamed downloads |
| `waveformColors` | `app/lib/theme.ts` | Colors of every waveform, from the current theme |
| `<IconButton>` | component | Every button that shows only an icon: one `label` is both its `aria-label` and its tooltip; all other props go to `UButton` (menu triggers included) |
| `<ThemeButton>` | component | The light/dark switch with its tooltip (header, public pages) |

---

## 6. Project structure

```
ChronoPlayer/
├── app/                              # Frontend (Nuxt 4 srcDir)
│   ├── app.vue · error.vue           # Root component · fatal error page
│   ├── app.config.ts                 # Nuxt UI theme (orange on zinc)
│   ├── assets/css/main.css           # Tailwind + Nuxt UI, base scale, room for the player bar
│   ├── components/
│   │   ├── AppHeader.vue · AppLogo.vue · ConfirmDialog.vue · StorageDialog.vue · CoverCropDialog.vue · DragHandle.vue
│   │   ├── IconButton.vue · ThemeButton.vue  # icon-only buttons with their tooltip · light/dark switch
│   │   ├── player/                   # PlayerBar, PlayerExpanded, PlayerQueue + PlayerQueueList (Up next),
│   │   │                             #   PlayerWaveform, PlayerControls, PlayerVolume, PlayerCastButton
│   │   ├── lyrics/                   # LyricsView, LyricsSyncEditor (tap to sync), LyricsSyncTimeline (markers)
│   │   ├── playlist/                 # PlaylistCover (custom or mosaic), PlaylistCreateDialog,
│   │   │                             #   PlaylistEditor (owner page of both purposes), PlaylistGrid (cards),
│   │   │                             #   PlaylistVersionFeedback (a group's votes, plays and comments)
│   │   ├── share/                    # ShareLinkBox (editors' sharing box), SharePlayer, ShareUnavailable,
│   │   │                             #   ShareVersionVote (a group's vote panel) (public pages)
│   │   ├── stats/                    # StatsDailyChart (one number per day: views, plays), StatsBreakdown (referrers, countries, devices)
│   │   └── track/                    # TrackList, TrackCover, TrackCoverPicker
│   ├── composables/                  # useTrackUploader (upload queue), useGenres, usePlaylists, useShareLink,
│   │                                 #   useQueueActions (Play next / Add to queue with toasts), useTrackDownload,
│   │                                 #   useAsyncTask, useEditForm, useCoverEditor, useCoverStorage, useSortableList,
│   │                                 #   useSharePage (useSharedItem, useShareMeta), useSignedInRedirect (see 5.5),
│   │                                 #   touch: useCloseOnBack (Android back), useSwipeToDismiss, useTrackSwipe (7.5),
│   │                                 #   useRemotePlayback (Cast to a TV or speaker, 7.5), useVersionVote (a visitor's pick, 7.17)
│   ├── layouts/                      # default (header + player), auth (sign-in), public (share pages)
│   ├── lib/                          # Browser code without Vue
│   │   ├── audio-engine.ts           #   the single <audio> element and its events
│   │   ├── audio-analysis.ts         #   tags, cover, duration, peaks
│   │   ├── direct-upload.ts          #   PUT to a presigned URL with progress and retries
│   │   ├── bytes.ts                  #   concatBytes, asciiAt (binary file code)
│   │   ├── image.ts                  #   crop geometry, square WebP covers
│   │   ├── queue-storage.ts          #   saved play queue (localStorage)
│   │   ├── queue-order.ts            #   shuffle rules: shuffle, unshuffle, new round
│   │   ├── player/                   #   the player store's parts (7.5): queue.ts (queue and order) · playback.ts
│   │   │                             #   (loaded track, engine, expired URLs) · sources.ts · settings.ts · types.ts
│   │   ├── feedback-playlist.ts      #   name of the "Share for feedback" playlist
│   │   ├── play-tracker.ts           #   when listening becomes a play (30 s or half; completed at 90%)
│   │   ├── listener-id.ts            #   this browser's random id, for plays and votes
│   │   ├── web-analytics.ts          #   which pages Vercel Web Analytics may count
│   │   ├── save-file.ts              #   hands a file built in the browser to the user
│   │   ├── haptics.ts                #   short vibrations as touch feedback (Android)
│   │   ├── tags/                     #   tags for downloads: track-tags · flac-tags · id3-tags · wav-tags
│   │   ├── media-session.ts · theme.ts
│   │   └── flac/                     #   wav.ts (parser) · encoder.ts (encode + verify) · flac.worker.ts · convert.ts
│   ├── pages/
│   │   ├── index.vue                 # Library
│   │   ├── login.vue · confirm.vue   # Sign-in / sign-up · auth callback
│   │   ├── tracks/new.vue            # Upload
│   │   ├── tracks/[id]/edit.vue      # Track editor (details, lyrics, sync)
│   │   ├── playlists/index.vue       # Playlists
│   │   ├── playlists/[id].vue        # Playlist editor (PlaylistEditor)
│   │   ├── versions/index.vue        # Versions (groups made by "Share for feedback")
│   │   ├── versions/[id].vue         # Group of versions (PlaylistEditor)
│   │   ├── stats.vue                 # Statistics (visits and plays of the share links)
│   │   ├── t/[id].vue                # Public track page (SSR)
│   │   └── p/[id].vue                # Public playlist page (SSR)
│   ├── plugins/                      # media-session.client.ts · queue-persistence.client.ts · web-analytics.client.ts
│   │                                 #   · play-counter.client.ts (reports plays, 7.16)
│   ├── services/api.ts               # Typed API client (the only place that knows the URLs)
│   ├── stores/player.ts              # Player store: puts together the parts in lib/player/ behind one API
│   └── utils/                        # errors (human-readable messages) · clipboard · visibility (labels, icons) · playlist-purpose
├── server/                           # Backend (Nitro)
│   ├── api/                          # HTTP routes (see section 9)
│   ├── services/                     # tracks · genres · playlists · sharing · storage-cleanup · covers · analytics (+ analytics-demo)
│   │                                 #   · plays (Statistics) · feedback (plays and votes)
│   │                                 #   · playback (streaming addresses, cover file removal)
│   ├── repositories/                 # tracks · genres · playlists · sharing · storage (covers) · audio-storage (R2, signed streaming addresses) · web-analytics (Vercel API) · keepalive · feedback (plays, votes)
│   ├── mappers/                      # track.ts · playlist.ts (rows ↔ domain types) · cover-urls.ts (cacheable cover addresses)
│   └── utils/                        # auth (requireAuth, visitorClient) · validation · errors · audio-storage · covers (cache headers) · web-analytics (data source)
├── shared/                           # Pure code used by client and server
│   ├── schemas/                      # track.ts · playlist.ts · analytics.ts · feedback.ts (Zod)
│   ├── types/                        # track.ts · playlist.ts · storage.ts · analytics.ts · database.types.ts (generated)
│   └── utils/                        # lyrics (LRC) · peaks · storage-paths · audio-files · time · text · numbers · arrays
├── supabase/
│   ├── config.toml                   # Local stack (ports, auth settings, S3 protocol)
│   ├── migrations/                   # Versioned schema (section 8.2)
│   ├── seed.sql                      # Local demo user
│   └── tests/database/               # pgTAP: rls.test.sql · playlists.test.sql · plays_votes.test.sql · function_privileges.test.sql
├── test/
│   ├── unit/                         # Vitest in Node: app/, server/, shared/, scripts/
│   ├── nuxt/                         # Vitest in a Nuxt environment: components
│   └── e2e/                          # Playwright: auth, library, sharing, playlists, queue, covers, download, lrc-transfer, storage, stats, versions, feedback, streaming, keepalive, responsive (phone + tablet)
├── scripts/
│   ├── stack.mjs                     # pnpm local / docker / stop
│   ├── lib/local-stack.mjs           # Docker check, Supabase status, .env writing
│   ├── setup-env.mjs                 # pnpm env:local
│   ├── gen-types.mjs                 # pnpm db:types
│   ├── check-r2.mjs                  # pnpm r2:check
│   ├── doctor.mjs                    # pnpm doctor (prerequisites check) · lib/doctor-checks.mjs
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
2. `tracks.service.listTracks` reads the summary columns only (no lyrics, peaks or long texts). Each cover gets a **stable, versioned address**, `/api/covers/tracks/<id>?v=<version>` (`mappers/cover-urls.ts`): nothing is signed.
3. The page filters (search, genre, mastering, version) and sorts **in the browser**: no request per keystroke.
4. Genres come from `GET /api/genres` (built-in + the user's custom ones), loaded once and shared by every page (`useGenres`).
5. Playing a track passes the **currently filtered list** as the queue: "next" follows what is on screen.

**Covers are cached by the browser.** A signed Storage URL carries a new token every time, so the browser would see a new image and download every cover again on each visit. The library therefore uses app addresses instead:

```mermaid
sequenceDiagram
  participant B as Browser
  participant N as Nuxt API
  participant S as Supabase Storage
  B->>N: GET /api/covers/tracks/:id?v=… (session cookie)
  N->>S: download the cover (user's JWT: RLS, own files only)
  N-->>B: WebP, Cache-Control: private, max-age=1 year, immutable
  Note over B: next visits, same URL: served from the browser cache, no request
```

- **Versioned:** `v` is the track's (or playlist's) `updated_at` in base 36. A new cover changes `updated_at`, hence the address, so the browser fetches the new image; the server ignores `v`.
- **Owner only:** the routes require the session and read the cover with the user's JWT; another user's track answers `404`. `private` keeps the image out of shared caches and CDNs.
- The same addresses serve playlist custom covers (`/api/covers/playlists/<id>?v=…`), the mosaics, the player, the queue, the Media Session artwork and the tags of downloaded files.
- **Public pages** (`/t/`, `/p/`) keep signed URLs: their visitors have no session these routes could check ([7.14](#714-sharing)).

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
- **Tags → metadata.** Title (or the file name), composers (composer tags, else the artist), album, year (1000-9999 only), lyrics, synced lyrics (an ID3 SYLT frame, or LRC text in a lyrics field: `lyricsFromTags` in `audio-analysis.ts`), cover. The genre tag is matched to an existing genre with the same name; genres are never created automatically.
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
| Browser closed between the upload and the registration | The file stays in R2 unused: an orphan, removed from the Storage dialog ([7.12](#712-storage-clean-up)) |

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
    N-->>P: streaming address /api/stream?… (6 hours)
  end
  P->>E: load(url) · play()
  E->>N: GET /api/stream?…
  N-->>E: 302 to a presigned GET
  E->>R: streaming with range requests
  loop every animation frame while playing
    E-->>P: time · duration · play/pause/ended
    P-->>UI: waveform, times, active lyric line
  end
  E-->>P: ended → next track in the queue
```

- **The engine** (`app/lib/audio-engine.ts`) wraps one `<audio>` element created on first use, outside Vue. While playing it reports the time on every animation frame (`timeupdate` alone fires only ~4 times a second, too coarse for lyrics).
- **The store** (`app/stores/player.ts`) holds the queue, the current track, status, time, volume, shuffle and repeat (saved in `localStorage`), speed and the full-screen flag. Components see one store with one flat API, but the state lives in separate parts in `app/lib/player/`, which the store puts together:
  - `queue.ts`, **the queue and its order**: the tracks, `index`, shuffle and the original order, the Up next edits. No audio: it only decides the order;
  - `playback.ts`, **the loaded track**: the reactive mirror of the engine (status, time, duration, volume, speed) and its commands, with the expired-URL recovery ([7.7](#77-expired-streaming-urls)). It knows nothing of the queue: the store tells it what to load and hears from it when a track ends. Every load increments a token: responses of superseded loads (fast double clicks) are ignored;
  - `sources.ts` (below) and `settings.ts` (volume, shuffle and repeat remembered on the device);
  - the store itself keeps the rules that need several parts at once: which track comes next (next, previous, repeat), shuffle and repeat, the public pages' players, the full-screen and Up next flags. A remote engine for the TV page ([15.2](#152-next-steps)) would sit beside `playback.ts` without touching the queue.
- **Track sources.** The store fetches data and URLs from a *source*: the library (signed-in API), a shared track or a shared playlist (public API). The same player, waveform and lyrics components therefore work on the public pages.
- **Waveform** (`PlayerWaveform.vue`): wavesurfer.js draws the stored peaks on the engine's own `<audio>` element; clicking, dragging or ←/→ seek directly. Nothing is downloaded twice.
- **The player bar** (`PlayerBar.vue`), always on screen while something is loaded:
  - on phones, cover and title, play/pause and next, and a thin progress line on top (the rest is in the full-screen view);
  - from `md` (768 px), three columns. Left: cover and title, truncated. Middle, on two rows: the elapsed time, the waveform and the remaining time, then the controls (shuffle, stop, previous, play, next, repeat), in the same order as the full-screen view and with the progress on top as on phones. Right: the volume, then Cast, Up next, expand and close. On tablets (`md` to `lg`) the volume is one more icon button that opens a popover with a vertical slider, and the Expand button is left out (Cast is always there on touch screens, and a fifth icon squeezed the title again; tapping the title, or swiping it up, opens the full-screen view anyway); from `lg` (1024 px) the slider sits inline;
  - from `lg` the columns grow from a zero basis at a 1:2:1 ratio (`flex-1` / `flex-[2]` / `flex-1`; the right one never narrower than its buttons), so the waveform keeps a real width at every size and the title truncates first. On tablets that ratio left the title about 100 px wide, so there the right column only takes its buttons' width (`flex-none`) and the middle one is `flex-[1.5]`, still wide enough for the six controls. Before, everything but the waveform had a fixed width, and at 768–1279 px the waveform shrank to nothing. The base font size is 125 % (106.25 % below 640 px), so rem sizes change while breakpoints stay in pixels: always check the bar at 768, 1024 and 1280 px after changing it;
  - the bar is 5.5 rem tall on phones and 6.5 rem from `md` (`--player-bar-height` in `main.css`, which also leaves that room under the page content): the two rows, a 32 px waveform and 2 rem buttons, keep some air around them;
  - the controls' tooltips open above them, so over the waveform; they close as soon as the pointer leaves the button (`disable-hoverable-content` in `IconButton`), so they never catch a click meant for the waveform.
- **"Previous"** restarts the current track when more than 3 seconds have played, otherwise goes back one track.
- **Repeat** (library playback only): *all* starts the queue again after its last track (and "Previous" on the first track goes to the last); *one* starts the track that ended again from 0:00 without reloading it (an expired URL is replaced first), while "Next" and "Previous" still change track. *Off* stops at the end of the queue.
- **Media Session** (`plugins/media-session.client.ts`, `lib/media-session.ts`): title, artist, album and cover on the lock screen and in the media notification, with play/pause/next/previous/seek controls. A track without a cover shows the app icon (the PWA icons in `public/`), and a missing artist or album reads "ChronoPlayer", so the card always shows the track and the app; artwork addresses are made absolute, since the system fetches them outside the page.
- **Screen off.** Playback goes on with the screen off or the app in the background, like a music app: the player is an `<audio>` element with an active Media Session, which Android browsers keep playing (they only pause *video* in the background, which is why YouTube stops), and nothing in the app pauses on `visibilitychange`; the next track starts by itself (`ended` still fires). What shows while the screen is **off** is up to the phone, not the app: Android draws nothing on a switched-off screen, except the music info some phones put on the always-on display (e.g. Samsung: Settings → Lock screen → Always On Display → Show music information). Pressing the power button shows the media card on the lock screen, unless Settings → Notifications (or Sound) → "Show media on lock screen" is off.
- **Cast** (`useRemotePlayback`, `PlayerCastButton.vue`): the browser's Remote Playback API on the app's single `<audio>` element. The browser finds the devices on the Wi-Fi network (Chromecast, Google TV, TVs and speakers with Chromecast built in, from Chrome-based browsers on Android; AirPlay devices from Safari on iPhone and iPad), shows its own picker and hands the audio address to the device, which fetches and plays it (signed URLs last 6 hours; Chromecast plays FLAC, MP3 and WAV). The element stays the controller, so the app's buttons, the queue and the lock-screen controls act on the device. The address cast is the app's streaming address, not a presigned storage URL: Chrome checks it with a HEAD request before offering any device, and a presigned GET answers that with a 403, so Chrome closed its picker at once ("NotAllowedError: The prompt was dismissed", in about 10 ms, in a Chrome tab and in the installed app alike); see [7.7](#77-expired-streaming-urls). The button is in the player bar from tablet width and in the full-screen view's top bar (phones). On touch screens it is **always there**, as in phone music apps: a tap opens the browser's picker, which searches the network then. With a mouse it only appears when the browser reports a device, or cannot tell until asked, as on video sites (most desktops have nothing to cast to). While casting it turns the primary colour, and pressing it again stops or moves the cast. A tap that finds nothing says "No devices found" (same Wi-Fi?); a refusal says "Casting is not available here", points to Chrome (Android) or Safari (iPhone, iPad), and adds **the browser's own answer** (error name, message and how fast it came, e.g. `NotSupportedError: … (12 ms)`): casting cannot be tried from a test browser, so on a real phone that text is the clue to why it failed. That covers Firefox (no API) and Chromium browsers without Google's casting service, such as **Opera on Android**: they refuse with the same error as a picker closed by the user (`NotAllowedError`), but at once, without showing anything, so a refusal under 300 ms is taken for "cannot cast" rather than "cancelled". TVs without Chromecast or AirPlay cannot be reached (Android's screen mirroring works there). **Bluetooth** speakers and headphones need nothing: Android routes all audio to them (pair in Settings → Bluetooth, or pick the output from the media notification).
- **Touch gestures** (touch events only, so a mouse never triggers them; VueUse `useSwipe` underneath):
  - **player bar** (`useTrackSwipe`): on the track area (cover and title), swipe left for the next track, right for "Previous" (same rule as the button: restart after 3 s), up to open the full-screen view. Cover and title follow the finger sideways and fade, then trigger past 80 px (or on a quick flick) or spring back; towards a next track that does not exist they follow stiffly and do nothing. The area has `touch-action: none`, so the browser neither scrolls nor navigates from it, and a plain tap still opens the full-screen view;
  - **full-screen view** (`useSwipeToDismiss`): pulled down from the top of its content it follows the finger, with the dimmed page showing behind (the modal panel is transparent and the view paints its own background), and closes past 120 px or on a flick. It never starts while the content is scrolled down, and never on what drags by itself (waveform, volume slider, lyrics: `data-swipe-ignore`). `overscroll-y-contain` keeps the browser's pull-to-refresh out of it;
  - the full-screen view's grid has an explicit single column on phones (`grid-cols-1`): without it a long title (which only truncates inside a column of fixed width) widened the column and pushed the view off the right edge.
- **Focus when the full-screen view opens:** the modal moves the focus inside, by default onto its first button, "Collapse player", whose tooltip then opened by itself (tooltips open on focus) and covered the cover. `PlayerExpanded` handles the modal's `openAutoFocus` and focuses the view's own root instead (`tabindex="-1"`): still inside the dialog for keyboards and screen readers, on no button.
- **Android back button** (`useCloseOnBack`): the full-screen view, Up next, the LRC dialog and the app's dialogs (confirmations, cover crop, new playlist, storage) each hold a browser `CloseWatcher` while open, so the back button or gesture closes the newest one instead of leaving the page or the installed app. Nothing is pushed into the history, so links followed from an open panel (e.g. "Edit track") and the router behave as before. Locked dialogs (deleting, saving) refuse and stay armed for the next press. On a desktop keyboard Esc is a close request too, but Nuxt UI already closes its topmost layer on Esc (which may be a menu above the panel), so a close request right after an Esc keydown is left to Nuxt UI. Chromium browsers only (Chrome, Opera, Edge, Samsung Internet); elsewhere nothing changes.

#### Which phone and tablet browsers can cast

As of October 2026. ✅ documented, ❓ to try on a device, ❌ cannot. Having the Remote Playback API is not enough: the browser must also be able to reach the device (Opera has the API but no Chromecast support for pages). The ✅ rows have not been tried on a real device yet either: replace a ❓ or confirm a ✅ when one is.

| Android | Casts the app (to Chromecast / Google TV) | Notes |
|---|---|---|
| **Chrome** | ❓ | The API and Google's casting service, and it finds a Chromecast built-in TV from its own "Cast…" menu. In October 2026 the Cast button was refused, in a tab and in the installed app alike ("NotAllowedError: The prompt was dismissed", ~10 ms): Chrome's HEAD check of the presigned audio URL got a 403. Fixed with the app's streaming address ([7.7](#77-expired-streaming-urls)); to confirm on the TCL Google TV |
| **Samsung Internet** | ❓ | Has the API since 6.2; it seems to cast through Android's system casting rather than Google's service, so whether a page reaches a Chromecast is unknown |
| **Brave** | ❓ | Chromecast reportedly on by default on Android (older sources) |
| **Edge, Vivaldi** | ❓ | Chromium-based, but casting is documented only for their desktop versions |
| **Opera** | ❌ | Casts only from its own video player, not from pages: the Cast button says "Casting is not available here" |
| **Firefox** | ❌ | No Remote Playback API |

| iPhone, iPad | Casts the app (to AirPlay: Apple TV, AirPlay TVs) | Notes |
|---|---|---|
| **Safari**, and the app added to the Home Screen from it | ✅ | The API since iOS 13.4, AirPlay only |
| **Chrome, Firefox, Edge… on iOS** | ❓ | They all run on Safari's engine (WebKit), so AirPlay may work; not documented |
| **Any browser, to a Chromecast** | ❌ | Google does not support casting from iOS browsers; only a TV app of our own would ([15.2](#152-next-steps), the TV page) |

In practice: **Chrome** on Android is the one to try for a Chromecast or Google TV (see its row), **Safari** on iPhone and iPad for AirPlay. Sources: [caniuse: Remote playback](https://caniuse.com/wf-remote-playback), [MDN: Remote Playback API](https://developer.mozilla.org/en-US/docs/Web/API/Remote_Playback_API), [Google: Cast for web](https://developers.google.com/cast/docs/web_sender), [Android Police: Opera's casting](https://www.androidpolice.com/2021/04/30/opera-for-android-finally-gets-casting-support-but-probably-not-the-way-you-want-it/), [Brave: Media Router on Android](https://github.com/brave/brave-browser/issues/13933).

### 7.6 Editable queue

The queue lives in the player store (`app/stores/player.ts`, its queue part in `app/lib/player/queue.ts`): the tracks already played, the current one (`index`) and the upcoming ones. Playing a track from a list makes that list the queue; from then on it can be edited.

| Action | Where | Effect |
|---|---|---|
| **Play next** | Track menu (library, playlist page); "Play next" in the Up next panel | Puts the track right after the current one. A track already in the queue is moved there instead of duplicated |
| **Add to queue** | Track menu | Appends the track. One already coming up stays where it is ("already in the queue"); one already played is moved to the end |
| **Reorder** | Up next panel: drag handle, or Move up/down | Changes the order of the upcoming tracks |
| **Remove** · **Clear** | Up next panel | Drops one upcoming track · all of them (playback stops after the current track; with repeat *all* it starts again from the first track of the queue) |
| **Play now** | Up next panel: click a track | Jumps to it; the tracks skipped become "previous" |
| **Shuffle** | Player bar (from 768 px wide), full-screen view | On: the upcoming tracks are shuffled (the current one and the history stay put). Off: they go back to the original order, carrying on from the current track |

- A track appears **at most once** in the queue, and only upcoming tracks can be edited: the current track and the history stay put, and `index` always points at the current track.
- When nothing from the library is playing, "Play next" and "Add to queue" simply start the track. A toast says what happened (`plays next`, `added to the queue`, `already playing`…).
- "Next", the end of a track and the lock-screen controls all follow the edited order.
- **Shuffle** reorders the queue itself (pure rules in `lib/queue-order.ts`), so Up next always shows the real play order. The store keeps the original order (`originalOrder`, track ids) to put it back: turning shuffle off continues from the current track in the original order, wrapping around, and drops manual moves made while shuffled. The original order is kept after shuffle is turned off too, so with repeat *all* every new round plays the list in that order (tracks added later at the end). With shuffle on, playing a track from a list puts it first and the rest of the list after it, shuffled (the playlist's *Play* button starts from a random track); "Add to queue" lands at a random place among the upcoming tracks, "Play next" still right after the current one; with repeat *all* every new round is reshuffled, never starting with the track that just ended.
- The panel (`PlayerQueue.vue` + `PlayerQueueList.vue`) mirrors the store: a drag moves the DOM through SortableJS, then the store receives the move, so the panel and the player never disagree.
- Queue editing applies to library playback only; the public pages have their own fixed order.
- **The queue survives reloads** on the same device (`lib/queue-storage.ts`, `plugins/queue-persistence.client.ts`): it is saved in the browser whenever it changes, every 5 seconds of playback and when the page is hidden. Opening the app again brings back the same queue and track, **paused at the same position**.
  - Only track ids are saved (format 2 adds `originalTrackIds`, the order before the first shuffle, once the queue has been shuffled; format 1 is still read as a queue without shuffle): on restore they are matched against the current library, so deleted tracks drop out (if the current one is gone, the next one is loaded from the start) and covers get their current addresses.
  - The saved queue belongs to one user: another account on the same browser never sees it.
  - Closing the player (×) or signing out forgets it. Public pages neither restore nor touch it.
  - It is per device: the queue on your phone and on your computer are separate.

### 7.7 Expired streaming URLs

**The streaming address.** The playback routes (`/api/tracks/:id/playback` and the two public ones) hand out the app's own address of the file, `/api/stream?k=<storage key>&e=<expiry>&s=<signature>` (`AudioStorage.streamUrl`, `server/api/stream.ts`), not a presigned storage URL:

- **HEAD** is answered by the app: `200` with the file's type, size and `Accept-Ranges`, read from the storage with a HEAD the server signs. Chrome sends this request before casting, and a presigned GET URL refuses any other method (`403`): with it, the Cast button could never work;
- **GET** gets a `302` to a presigned GET of the file, valid as long as the address: the audio, range requests included, still comes straight from the storage, never through the app's server;
- **the signature** is an HMAC-SHA-256 of the key and the expiry, with a key derived from the storage secret (`chronoplayer-stream:` + the secret: nothing more to configure). A cast device has no session, so the address itself carries the permission; an altered key or expiry, a forged signature or an expired address get `403`, without telling whether the file exists. Answers carry `Access-Control-Allow-Origin: *` (a cast device's player runs on another origin) and `Cache-Control: no-store`.

The cost is one small function call per load or seek of a track (the redirect), instead of none.

Streaming addresses last 6 hours, and a paused track can sit for longer. The store recovers transparently:

1. **Before resuming or seeking**, if the URL expires within a minute, a fresh one is fetched and loaded at the same position.
2. **If storage refuses a URL anyway** (an error while playing or buffering), the source is reloaded once at the current position, then playback resumes.
3. Only if that also fails is an error shown in the player bar. Pressing play again retries from scratch.

The playback speed survives reloads (`defaultPlaybackRate`), and the waveform follows since it is bound to the same element.

### 7.8 Editing a track

1. `tracks/[id]/edit.vue` loads `GET /api/tracks/:id`. The form validates with the same Zod schema as the server (`trackMetadataSchema`).
2. **Save** sends `PATCH /api/tracks/:id`. The mapper turns only the fields present into columns (`undefined` = unchanged, `null` = cleared); RLS guarantees the track is the user's. Leaving the page with unsaved changes asks for confirmation (`useEditForm`, shared with the playlist page).
3. **Genre:** typing a new name and choosing "Create" calls `POST /api/genres`, which returns an existing genre with the same name (built-in or custom, case-insensitive) instead of creating a duplicate.
4. **Cover:** a picked image opens the **crop editor** (`CoverCropDialog.vue`, see below); the browser then cuts the chosen square and converts it, uploads it to `covers/<userId>/<trackId>.webp` (overwriting the old one), then sends `PATCH { coverPath }` (`useCoverEditor`, shared with the playlist page). Removing it (`coverPath: null`) makes the server delete the file.
5. The updated track is pushed to the player (`syncTrack`), so the bar, the queue and the full-screen view show the new title, cover, lyrics and description at once.

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
- **The editor** (`LyricsSyncEditor.vue`) builds its rows from the lyrics (empty lines skipped). <kbd>Space</kbd> or <kbd>↓</kbd> (or the Stamp line button) stamps the next unsynced line with the player's current time; headers are never stamped. On phones Stamp line and Undo move to a bar pinned above the player bar (`position: sticky`, so it stays under the thumb while the lines scroll with the page), and the keyboard legend shows only with a mouse or trackpad (`pointer-fine`). Syncing is done by ear, often without touching the phone for a while: while the Sync tab is open with its track loaded the **screen is kept on** (Screen Wake Lock, VueUse `useWakeLock`, asked again when the page returns to the foreground and released on leaving the tab), and a stamp gives one short **vibration**, an undo two (`lib/haptics.ts`, Vibration API: Android only, silently skipped elsewhere). "Reload from lyrics" rebuilds the rows keeping the times of lines already synced.
- **Syncing aids** (all manual):
  - speed 0.5× / 0.75× / 1× with the pitch preserved, reset to 1× when leaving the Sync tab (the player bar shows a speed badge meanwhile);
  - a **detailed waveform** (`LyricsSyncTimeline.vue`) that decodes the track itself (the stored 1000 peaks are too coarse to see where a phrase starts), follows playback, zooms from 20 to 400 px/s and shows a numbered, draggable marker per synced line;
  - a **selected line** (the last stamped, or one clicked in the list or on the waveform): <kbd>R</kbd> replays it from 1 s before, <kbd>←</kbd>/<kbd>→</kbd> move it by 0.05 s (the ±0.1 s buttons of each row do the same with the mouse); <kbd>↑</kbd> undoes the last stamp; <kbd>P</kbd> plays/pauses.
- **LRC** import/export (`shared/utils/lyrics.ts`) keeps sections (`[00:10.00] [Verse 1]`, or an untimed `[Verse 1]` attached to the next timed line), supports several timestamps per line and `[offset:]`. The LRC dialog imports pasted text or an opened `.lrc` file (shown first, applied with *Apply*), and exports by **Copy** or **Download .lrc** (`Composers - Title.lrc`).
- **Moving synced lyrics to another ChronoPlayer** (e.g. from the local app to production), two ways:
  - one track at a time: *Download .lrc* here, *Open file* + *Apply* + *Save* there;
  - with the audio: download the track (FLAC or MP3 carry the sync, [7.11](#711-downloading-a-track)) and upload that file there: the upload reads the sync back with the rest of the metadata. Description, Suno prompt, visibility and mastering status do not travel this way.
- **While playing**, the active line is found with a binary search (`findActiveLineIndex`, never a header) and scrolled into view; scrolling by hand pauses auto-scroll for 4 seconds. `LyricsView` scrolls inside its own box (`h-full`), so its parent must give it a definite height: otherwise the box grows with the text and auto-scroll moves whatever scrolls around it.
- **Where the lyrics show in the full-screen player** (`PlayerExpanded.vue`): from `md` in the right column, beside the cover. On phones they used to sit under the controls, in the one scrolling column, where they could never fill the screen and their auto-scroll dragged the whole view along; now the phones' normal view shows the track's description there instead, and the **lyrics view** (top-bar button, shown when the track has lyrics) gives them the screen: a small cover and title on top, `LyricsView size="large"` in a box that fills the rest (its lines fade out at the edges, a CSS mask), the waveform and previous / play / next at the bottom. The choice is kept in `localStorage` (`chronoplayer:lyrics-view`); a track without lyrics shows the normal view whatever the choice. While the lyrics view is open and the music plays, the screen is kept on (Screen Wake Lock, VueUse `useWakeLock`, as in the sync editor): reading along means not touching the phone. Paused, or back on the cover, the screen behaves as usual again. The phone/wide switch is a media query in JavaScript (`useMediaQuery`), not CSS, so only one layout, and one waveform, is ever mounted.

### 7.10 Deleting a track

`DELETE /api/tracks/:id`: the row is deleted first (so the track disappears even if storage is slow), the track leaves every playlist (database cascade), then the server removes the audio from R2 and the cover from Supabase Storage, best effort. The page drops it from the list and from the player queue, closing the player if it was playing.

### 7.11 Downloading a track

"Download" (track menu in the library and in playlists, button on the edit page) runs entirely in the browser (`useTrackDownload`, `app/lib/tags/`): a Vercel function may not return a 50 MB file.

```mermaid
sequenceDiagram
  participant B as Browser
  participant N as Nuxt API
  participant R as Cloudflare R2
  B->>N: GET /api/tracks/:id + GET /api/tracks/:id/playback
  N-->>B: track data + streaming address
  B->>N: GET /api/stream?…
  N-->>B: 302 to a presigned GET
  B->>R: GET the file (progress in a toast)
  opt FLAC or MP3 with a cover
    B->>N: GET /api/covers/tracks/:id (usually already in the browser cache) → re-encoded as JPEG
  end
  B->>B: write the tags (FLAC / MP3 / WAV writer)
  B->>B: save as "Composers - Title.ext"
```

| Stored format | Tags written | Fields |
|---|---|---|
| FLAC (every converted WAV) | Vorbis comments + PICTURE block (`flac-tags.ts`) | title, artist, composer, album, date, genre, comment, lyrics, synced lyrics, front cover |
| MP3 | ID3v2.3 (`id3-tags.ts`, browser-id3-writer); an old ID3v1 tag is removed | the same |
| WAV (float masters kept as WAV) | RIFF LIST/INFO (`wav-tags.ts`) | title, artist, album, year, genre, comment — WAV has no standard place for a cover or lyrics; text is Latin-1, other characters become `?` |
| OGG/Opus, M4A/AAC, WebM | none: saved as stored | — |

- **The audio is never touched:** only the metadata part of the file is rebuilt (FLAC metadata blocks, the ID3 tag, the INFO chunk). Tags already in the file are replaced, not duplicated. The unit tests read every written file back with music-metadata and compare the audio bytes.
- **What is written** is the saved data (unsaved edits are not): composers become both *artist* and *composer*, the description becomes the *comment*, lyrics keep their `[Section]` headers. The Suno prompt and the mastering status are personal notes and never leave the app.
- **Synced lyrics:** in FLAC, `LYRICS` holds them as LRC text (the common convention: players that support it show them in sync) and `UNSYNCEDLYRICS` keeps the plain text; in MP3, the standard `SYLT` frame (times in ms) sits next to the plain `USLT` lyrics. Uploading such a file reads them back.
- **The cover** is stored as WebP, which many players do not show inside a tag: it is re-encoded as JPEG for the file. A cover that cannot be read only means a file without cover, never a failed download.
- **File name:** `Composers - Title.ext` (or `Title.ext`), with the characters Windows, macOS or Linux refuse replaced by `_`, at most 150 characters.
- **Feedback:** when a download takes more than about 0.7 s, a neutral toast with a spinner shows the progress (a fast download would only flash it, which looks like an error); at the end a toast lists exactly which fields were written.

### 7.12 Storage clean-up

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

### 7.13 Playlists

```mermaid
sequenceDiagram
  participant B as Browser
  participant N as Nuxt API
  participant D as Postgres
  B->>N: POST /api/playlists {title, purpose?, trackIds?}
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
- **Reordering and removing** save immediately (`PUT …/tracks` with the full ordered list). The page updates optimistically and rolls back if the request fails. Drag uses SortableJS through a handle (works with touch; `useSortableList` and `<DragHandle>`, shared with the "Up next" panel); Move up/down is the keyboard-friendly alternative.
- **Atomic order.** `set_playlist_tracks()` deletes and re-inserts every row in one database transaction, running with the caller's rights: RLS refuses other users' playlists and tracks.
- **Covers.** A custom cover goes through the same crop editor as track covers, and is uploaded to `covers/<userId>/playlists/<playlistId>.webp`. Without one, the UI shows a **mosaic**: the server lists the cover addresses of the first 4 tracks that have one (the same cached `/api/covers/tracks/…` images as the library); 4 covers make a 2×2 grid, fewer show the first alone (`PlaylistCover.vue`).
- **Play all** queues the playlist's tracks in order in the normal player.
- **Deleting** a playlist removes it and its custom cover; its tracks stay in the library.
- **Two purposes.** Everything above also serves the groups of versions made by "Share for feedback" (`purpose: 'versions'`): they are listed on their own Versions page and left out of the Playlists page and the "Add to playlist" menus ([7.17](#717-draft-versions-and-feedback)).

### 7.14 Sharing

| Visibility | Who can listen | Share page |
|---|---|---|
| `private` | Only the owner | None: the link answers `404`, exactly like a missing item |
| `unlisted` | Anyone with the link | `noindex`: kept out of search engines |
| `public` | Anyone with the link | Can be indexed by search engines |

There is no public catalog: other people reach an item only through its link (`/t/<track id>` or `/p/<playlist id>`); ids are random UUIDs, so links cannot be guessed. The share boxes and "Copy share link" use the **saved** visibility: a change applies once saved.

**Share sheet on touch screens** (`useShareLink().shareLink`): on a touch screen whose browser has the Web Share API (Android, iPhone, iPad) the button and the menu item read "Share link" and open the device's share sheet with the title and the link; with a mouse they copy the link as before (desktop share sheets are rarely what anyone wants). Closing the sheet does nothing; a refused sheet (e.g. "Share for feedback", where the request to create the group can take long enough after the tap for the browser to refuse) falls back to copying. The choice is made after mount, so the server-rendered page and the first client render agree.

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
  N-->>V: streaming address /api/stream?… (6 hours)
  V->>N: GET /api/stream?… → 302 to a presigned GET
  V->>R2: streaming (range requests)
```

**A shared playlist** (`pages/p/[id].vue`) works the same way through `get_shared_playlist(id)` and `get_shared_playlist_tracks(id)`. The first track is cued on load; the page shows the list, the waveform and, beside them, the lyrics and description of the track being played. Audio comes from `GET /api/shared/playlists/:id/tracks/:trackId/playback`, which signs **only tracks that belong to that shared playlist**.

- **Only shareable fields leave the database.** Other people cannot read the `tracks` or `playlists` tables at all. The `get_shared_*` functions (security definer) return title, composers, album, year, genre name, description, lyrics, peaks and duration — never the Suno prompt, the mastering status or the owner (checked by pgTAP tests).
- **Private tracks inside a shared playlist** can be heard through that playlist only: their own `/t/` link still answers `404`, and their audio is signed only via the playlist's id. The playlist editor warns how many private tracks are included.
- **Link previews.** The pages set `og:title`, `og:description`, `og:image` and `robots`. The image points to `/api/shared/…/cover`, a stable address that redirects to a fresh signed URL (previews are cached for a long time; signed URLs expire). A playlist without a custom cover uses its first track cover.
- **Revoking.** Making an item private closes its page immediately (the next request answers `404`); an audio URL already handed out keeps working until it expires, at most 6 hours.
- **Leaving a public page** stops its music: it is the only place that controls it.
- **One implementation for both pages.** `useSharedItem` loads the item during SSR and sets the `404`/`500` status, `useShareMeta` writes the preview tags, `<SharePlayer>` and `<ShareUnavailable>` render the player and the "not available" state. On the server, `toSharedTrackContent` builds the shareable fields of a shared track and of every track of a shared playlist, and `presignPlayback` signs their audio.

### 7.15 Where each piece of data lives

| Data | Stored in | Who reads it |
|---|---|---|
| Accounts, sessions | Supabase Auth | Supabase; the session JWT in browser cookies |
| Track metadata, lyrics, peaks, visibility | Postgres `tracks` | Owner (RLS); shareable fields via `get_shared_*` |
| Genres | Postgres `genres` (built-in + custom) | Everyone (built-in), owner (custom) |
| Playlists, groups of versions and their order | Postgres `playlists` (`purpose` tells them apart), `playlist_tracks` | Owner (RLS); shared ones via `get_shared_playlist*` |
| Audio files | Cloudflare R2 (`<userId>/<trackId>.<ext>`) | Anyone holding a streaming address or the presigned URL it redirects to, both issued by the server and expiring |
| Covers | Supabase Storage `covers` (private) | The owner, through `/api/covers/…` (and a copy in their browser cache); visitors of shared pages, through signed URLs issued under the storage policies |
| Volume | Browser `localStorage` (`chronoplayer:volume`) | That browser only |
| Lyrics view on or off (phones' full-screen player) | Browser `localStorage` (`chronoplayer:lyrics-view`) | That browser only |
| Play queue (track ids, current track, position) | Browser `localStorage` (`chronoplayer:queue`) | That browser, for the signed-in user only |
| Visits to the share pages | Vercel Web Analytics (aggregated, no cookies) | The owner, through `/api/analytics` (the server holds the Vercel token) |
| R2 credentials, Vercel token | Server environment only | The server |

### 7.16 Statistics

**Counting** happens on the deployed site only (`plugins/web-analytics.client.ts`):

- `@vercel/analytics` loads Vercel's script from `/_vercel/insights`, which exists only on Vercel deployments: the plugin runs only when `public.webAnalytics` is true, i.e. the build ran on Vercel (`VERCEL=1`).
- Its `beforeSend` hook drops every event except the **share pages** (`/t/<id>`, `/p/<id>`, `lib/web-analytics.ts`) and every visit by a **signed-in** user: the owner opening their own link does not count, and private app pages do not use up the plan's allowance.
- No cookies; Vercel counts unique visitors with a hash that changes every day. Vercel cannot count plays (custom events are not part of its Hobby plan): the app counts them itself, see **Plays** below.

**Reading** (`GET /api/analytics?days=7|30`, `analytics.service.ts`):

```mermaid
sequenceDiagram
  participant B as Browser (stats page)
  participant N as Nuxt API
  participant D as Postgres
  participant V as Vercel Analytics API
  B->>N: GET /api/analytics?days=30
  N->>D: the user's tracks and playlists (RLS)
  N->>V: 6 aggregate queries filtered on their paths<br/>(total, per day, per path, referrer, country, device)
  V-->>N: rows
  N-->>B: AnalyticsReport (source: vercel)
```

- **Only the user's pages:** Vercel counts the whole site, so every query is filtered on `environment eq 'production' and requestPath in ('/t/…', '/p/…')`, with the paths of **all** the user's tracks and playlists (a page made private again keeps its past visits). The filter is limited to 2048 characters, so paths go in groups of 40 and the groups' results are summed (unique visitors of different groups can then count twice).
- The **token** stays on the server (`runtimeConfig.analytics`); the browser only sees the report. Vercel errors become a `502` with a readable message (`refused the access token: check NUXT_ANALYTICS_TOKEN`), never the token.
- **Where the numbers come from** (`server/utils/web-analytics.ts`, the report's `source`):

| Situation | `source` | The page shows |
|---|---|---|
| Token and project id configured | `vercel` | Real data |
| Not on Vercel (local, Docker, e2e) and not configured | `demo` | **Made-up numbers** around your real tracks and playlists, deterministic, under a yellow "Demo data" banner |
| On Vercel without token or project id | `unconfigured` | How to configure it ([13.6](#136-statistics-vercel-web-analytics)); never demo data, which could be mistaken for real |

- The page lists every shared item (even without visits) and every item visited in the period; "Private now" marks a page no longer shared.

**Plays** are counted by the app itself (table `plays`), so they are real everywhere, local development included, and visitors with an ad blocker count too:

- **When:** `plugins/play-counter.client.ts` follows the player's position and asks `lib/play-tracker.ts` how much has really been listened to: only the position moving forward a little at a time while playing at normal speed. A seek, a pause or the slowed-down playback of the lyrics sync editor adds nothing. A **play** is 30 seconds, or half of a shorter track; it is **completed** at 90%. The plugin then sends `POST /api/plays` (again with `completed` at 90%); a failed report is simply lost.
- **Where:** every player counts. On the share pages the context is the track's own page or the shared playlist the track is heard through (`playlistId`); in the library the plays are the owner's own.
- **Who:** `record_play` (SQL, `security definer`) recognises the **owner by the session**, never by what the browser says, and stores their plays as `owner` plays, shown apart ("Your own plays"). Anyone else is a `visitor`, identified only by a random id kept in their browser (`lib/listener-id.ts`, also used for votes): one play per listener, track, context and UTC day (replaying the same day only marks the play completed). The function accepts a play only where the caller can listen: a non-private track on its own page, a track inside a non-private playlist through that playlist, or the caller's own track; anything else answers like a missing track (`404`).
- **Reading** (`GET /api/analytics/plays?days=7|30`, `plays.service.ts`): the period's plays of the user's tracks (RLS: owner only, read 1000 rows at a time since PostgREST cuts longer results), summed in total, per day and per share page (`/t/<id>` or `/p/<id>`, the same key as Vercel's items, so the page joins both lists). Plays heard through a playlist deleted since still count in the totals.
- **The page** shows both: tiles (views, visitors, pages visited · plays, listeners, your own plays), **one chart each** for views and plays per day (different scales, never one shared axis: `StatsDailyChart` takes any one number per day), and every shared page with its views and its plays (how many to the end). Without Vercel's numbers (`unconfigured`), the plays are still there.

### 7.17 Draft versions and feedback

A track is a **draft** (a work in progress) or **final** (`tracks.status`, enum `track_status`). New uploads start as drafts (the column default); tracks that existed before the feature became final.

```mermaid
flowchart LR
  Upload["Upload 2-3 Suno versions<br/>(drafts)"] --> Select["Library → Select<br/>tick the versions"]
  Select --> Share["Share for feedback<br/>unlisted group of versions + link copied"]
  Share --> Friends["Friends open /p/…<br/>listen (plays counted) and pick one ♥"]
  Friends --> Feedback["Versions page<br/>votes, plays, comments"]
  Feedback --> Final["Mark the chosen one final<br/>(voting closes)"]
  Final --> Delete["Filter Drafts → Select all → Delete"]
```

- **Marking:** "Mark as final / Mark as draft" in the track menu (library or group of versions), the *Version* switch on the edit page, or *Mark final* on a selection. Each is a `PATCH /api/tracks/:id { status }`; a selection sends one request per track, in parallel, and reports partial failures.
- **Selection mode** (`pages/index.vue`, `TrackList.vue` with `selectable`): checkboxes on every row; a click on a title ticks it instead of playing, while the cover still plays, so versions can be compared while choosing. Only visible tracks stay selected (changing a filter unticks the hidden ones), so an action never touches what is not on screen. The bar stays under the header while scrolling; on phones its actions are icons.
- **Share for feedback:** one `POST /api/playlists` with `purpose: 'versions'`, `visibility: 'unlisted'` and the ticked tracks, titled after their common name (`lib/feedback-playlist.ts`: "Night drive v1" + "Night drive v2" → "Night drive – versions"), then its link is copied. Like any shared playlist, it shares its private tracks inside the group only ([7.14](#714-sharing)).
- **Groups of versions are playlists with another purpose** (`playlists.purpose`, enum `playlist_purpose`): same tables, RLS, share links, storage rules and editor, so nothing about sharing had to be written twice. Only where they appear differs: `GET /api/playlists?purpose=versions` feeds the **Versions** page (`pages/versions/`), while the Playlists page and every "Add to playlist" menu ask for `purpose=playlist` (the default). The purpose is set at creation and never changes. Each purpose has its own cached list (`usePlaylistList(purpose)`); an old `/playlists/:id` link of a group moves to `/versions/:id`.
- **The group's page** (`PlaylistEditor` with `purpose="versions"`) is the playlist editor worded for versions, with a **Final** badge on the chosen one and "Mark as final / draft" in each version's menu. The public page says "Versions · 3 versions" instead of "Playlist · 3 tracks" and, without a description, asks the listener to pick a favourite.
- **Share pages:** `get_shared_track` and `get_shared_playlist_tracks` return the status; drafts show **Work in progress** on `/t/…`, and **WIP** in the list and "Work in progress" in the now-playing header on `/p/…`.
- **Votes** (table `version_votes`): on a group's public page each version has a **heart**; a friend picks one (tapping it again takes the pick back) and can add a **name** and a **comment** for the owner. One pick per browser and group (the random id of `lib/listener-id.ts`), changeable at will. Nobody sees anyone else's pick; the owner opening their own group gets a note instead of the hearts (the API refuses an owner's vote with `403`). Everything goes through `cast_version_vote`, `withdraw_version_vote` and `get_version_vote` (SQL, `security definer`): the group must be shared and the version must belong to it.
- **Voting closes** as soon as a version of the group is **final** (`409` from then on, and the public page shows which one was chosen, with a **Chosen** badge); marking it draft again reopens it. A pick of a version since removed from the group stops counting.
- **Feedback on the Versions page** (`GET /api/playlists/:id/feedback`, `PlaylistVersionFeedback.vue`): whether voting is open, votes and listeners in total, one row per version with its votes as a bar and its plays heard through the group's link (visitors only), and the picks that came with a name or a comment, most recent first. Each version's row in the list also shows its votes and plays. Marking a version final or removing one reloads it.
- **Statistics** count a group's link like any playlist link (`/p/…`), its plays included.
- **Bulk delete:** one `DELETE` per ticked track, in parallel, after one confirmation listing them; tracks that fail stay selected for a retry.

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
  TRACKS ||--o{ PLAYS : "is played"
  PLAYLISTS ||--o{ VERSION_VOTES : "collects"
  TRACKS ||--o{ VERSION_VOTES : "is picked"

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
    enum status "draft | final (new: draft)"
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
    enum purpose "playlist | versions"
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
  PLAYS {
    bigint id PK
    uuid owner_id FK "the track's owner"
    uuid track_id FK "cascade"
    uuid playlist_id "heard through it; no FK: kept after a deletion"
    enum listener "visitor | owner"
    uuid listener_id "browser id, or the owner's user id"
    date played_on "UTC; one row per track, context, listener, day"
    boolean completed "90% listened"
  }
  VERSION_VOTES {
    uuid playlist_id PK, FK "cascade"
    uuid voter_id PK "browser id"
    uuid track_id FK "the version picked, cascade"
    text name "optional, 1-60"
    text comment "optional, 1-1000"
    timestamptz updated_at "trigger"
  }
```

Constraints worth knowing: file paths must start with the owner's id; the owner of a track or playlist can never change (trigger); a track appears at most once per playlist; a listener counts once per track, context and day; a browser has one vote per group; deleting a user deletes everything they own.

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
| `20261023000000_track_status.sql` | `tracks.status` (`draft` / `final`: existing tracks final, new ones draft); the sharing functions return it |
| `20261024000000_playlist_purpose.sql` | `playlists.purpose` (`playlist` / `versions`; existing unlisted "… – versions" playlists become groups); index by purpose; `get_shared_playlist` returns it |
| `20261024120000_plays_and_votes.sql` | `plays` and `version_votes`, readable by the owner only; `record_play`, `cast_version_vote`, `withdraw_version_vote`, `get_version_vote` and their internal helpers (revoked from `anon` and `authenticated` explicitly) |
| `20261024130000_private_helpers.sql` | Internal functions out of the API: the policy helpers `is_shared_track_file` and `owns_playlist` move to the unexposed `private` schema (`set_playlist_tracks` recreated to call the latter there), `set_playlist_tracks` for signed-in users only, the trigger functions callable by nobody |

### 8.3 Database functions

| Function | Security | Purpose |
|---|---|---|
| `get_shared_track(id)` | definer | Shareable fields of a non-private track (nothing for private ones) |
| `get_shared_playlist(id)` | definer | A non-private playlist's title, description, cover, visibility, purpose |
| `get_shared_playlist_tracks(id)` | definer | Shareable fields of every track of a non-private playlist, in order (private tracks included) |
| `private.is_shared_track_file(bucket, path)` | definer | Storage policy helper: the file belongs to a non-private track, to a track in a non-private playlist, or is a non-private playlist's cover |
| `set_playlist_tracks(id, ids[])` | invoker | Replaces a playlist's tracks in one transaction (RLS applies); signed-in users only |
| `private.owns_playlist(id)` | invoker | RLS helper for `playlist_tracks` and `version_votes` |
| `record_play(track, playlist, listener, completed)` | definer | Counts a play where the caller can listen (shared track page, shared playlist containing it, own track); the owner, recognised by the session, gets `owner` plays |
| `cast_version_vote(group, track, voter, name, comment)` · `withdraw_version_vote(group, voter)` | definer | A visitor's pick in a shared group of versions: the version must belong to it; `403` for the owner, `409` once a version is final |
| `get_version_vote(group, voter)` | definer | Voting open, whether the caller owns the group, and this browser's own pick (never anyone else's) |
| `shared_group_owner(id)` · `version_voting_open(id)` · `check_version_voting(id, voter)` | definer, internal | Helpers of the vote functions; not callable through the API |
| `set_updated_at()` · `prevent_owner_change()` | trigger | Timestamps · immutable owner (no role may call them directly) |

*Security definer* functions bypass RLS, so each one filters on visibility itself and selects explicit columns; all have an empty `search_path`. **What the API offers.** Every function of the `public` schema the caller may execute is callable through the Data API (`POST /rest/v1/rpc/<name>`), and Supabase's default privileges grant `execute` on new functions there to `anon` and `authenticated` explicitly, so `revoke … from public` alone does not hide one. The rules:

- a function meant for the API stays in `public`, granted to the roles that need it (`get_shared_*`, plays, votes: both roles; `set_playlist_tracks`: `authenticated`);
- an internal helper of other functions stays in `public` but is revoked from `anon` and `authenticated` by name (the vote helpers): the definer functions that call it run as its owner;
- a **helper of policies** cannot be revoked, since the policies run as the requesting role and need `execute`: it lives in the **`private` schema**, which the API does not expose (`[api] schemas` in `supabase/config.toml`, the same default on Supabase Cloud), with `usage` granted to the roles whose policies call it. Policies refer to a function by its identity, so moving one keeps them working; function bodies refer to it by name and must be updated.

`function_privileges.test.sql` lists exactly what each role may call in `public`: a new function exposed by mistake fails the tests.

### 8.4 Storage

| Bucket | Where | Content | Access |
|---|---|---|---|
| `covers` | Supabase Storage (private) | `<userId>/<trackId>.webp`, `<userId>/playlists/<playlistId>.webp` | Write: own folder only. Read (sign): own files, or files of shared items |
| `chronoplayer-audio` | Cloudflare R2 (private) | `<userId>/<trackId>.<ext>` | Only through streaming addresses and presigned URLs issued by the server |
| `audio` | Local Supabase only | Same layout as R2 | Stand-in for R2 in development (S3 protocol) |

### 8.5 Security guarantees

Verified by the pgTAP tests (`supabase/tests/database/`), plus unit and end-to-end tests:

- A user reads, changes and deletes only their own tracks, genres and playlists. Nobody can create items for someone else or change an item's owner.
- Playlists can only contain the owner's own tracks.
- Anonymous visitors cannot read any table; through the API they can only call the `get_shared_*` functions, which return nothing for private items and never the Suno prompt, the mastering status or the owner, and the plays and votes functions. Internal helpers are not callable at all (checked function by function).
- A private track inside a shared playlist is reachable only through that playlist.
- Plays and votes are written only through their functions, only where the caller can listen or vote; the owner's plays are kept apart by the session, and only the owner reads plays and votes. A visitor sees their own pick, never anyone else's.
- Files can be uploaded only into one's own folder, and read only when they are one's own or belong to shared items.
- Every bucket is private: files are reachable only through expiring signed URLs. The R2 keys exist only on the server.
- The public Supabase key (`SUPABASE_KEY`) can live in the browser: protection comes from the policies, not from hiding the key. The service key is never used.
- API errors never include SQL messages or stack traces (logged server-side only).

---

## 9. API reference

All routes live in `server/api/`. **Auth:** every route requires a session cookie (`401` otherwise), except `/api/health`, `/api/keepalive`, `/api/plays` and `/api/shared/**`. **Errors:** JSON `{ statusCode, message }`; validation errors are `400` with per-field `data.issues`; an item that is missing, private or someone else's is always `404`. Types: `shared/types/*.ts`; request bodies: `shared/schemas/*.ts`.

**Tracks and genres**

| Method | Path | Body | Response |
|---|---|---|---|
| `GET` | `/api/health` | | `{ status, time }` (public) |
| `GET` | `/api/keepalive` | | `{ status, time }` (public): one tiny database query, called daily by Vercel Cron ([13.7](#137-keeping-supabase-awake)) |
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

**Covers** (images, cached by the browser for a year: `Cache-Control: private, max-age=31536000, immutable`)

| Method | Path | Response |
|---|---|---|
| `GET` | `/api/covers/tracks/:id?v=…` | The track's cover (WebP); `404` without a cover or for someone else's track |
| `GET` | `/api/covers/playlists/:id?v=…` | The playlist's custom cover (WebP); `404` without one |

The addresses come ready-made in `coverUrl` and `mosaic` of the track and playlist responses; `v` only changes the URL when the item changes.

**Playlists** (and groups of versions: the same routes, told apart by `purpose`)

| Method | Path | Body | Response |
|---|---|---|---|
| `GET` | `/api/playlists?purpose=playlist\|versions` | | `PlaylistSummary[]` of that purpose (default `playlist`), newest first; `400` for another value |
| `POST` | `/api/playlists` | `{ title, purpose?, description?, visibility?, trackIds? }` (`purpose` fixed from then on) | `201 PlaylistDetail` |
| `GET` | `/api/playlists/:id` | | `PlaylistDetail` |
| `PATCH` | `/api/playlists/:id` | any subset of `{ title, description, visibility, coverPath }` | `PlaylistDetail` |
| `DELETE` | `/api/playlists/:id` | | `204` (tracks stay in the library) |
| `PUT` | `/api/playlists/:id/tracks` | `{ trackIds }` (full ordered list) | `PlaylistDetail` |
| `POST` | `/api/playlists/:id/tracks` | `{ trackIds }` (to append) | `PlaylistDetail` |
| `GET` | `/api/playlists/:id/feedback` | | `VersionFeedback`: voting open, votes and plays per version, comments; `404` unless a group of versions |

**Statistics**

| Method | Path | Response |
|---|---|---|
| `GET` | `/api/analytics?days=7` or `?days=30` | `AnalyticsReport`: totals, per day, per item, referrers, countries, devices (default 30 days; `400` for other values; `502` when Vercel Analytics fails) |
| `GET` | `/api/analytics/plays?days=7` or `?days=30` | `PlaysReport`: visitors' plays in total, per day and per share page, and the user's own plays apart |

**Public (no sign-in)**

| Method | Path | Response |
|---|---|---|
| `GET` | `/api/shared/:id` | `SharedTrack` |
| `GET` | `/api/shared/:id/playback` | `PlaybackSource` |
| `GET` | `/api/shared/:id/cover` | `302` to a fresh signed cover URL |
| `GET` | `/api/shared/playlists/:id` | `SharedPlaylist` (all tracks, shareable fields) |
| `GET` | `/api/shared/playlists/:id/tracks/:trackId/playback` | `PlaybackSource`, only for tracks of that playlist |
| `GET` · `HEAD` | `/api/stream?k=&e=&s=` | The address in every `PlaybackSource`: `HEAD` → `200` with type and size, `GET` → `302` to a presigned GET; `403` unless signed by the server and unexpired ([7.7](#77-expired-streaming-urls)) |
| `GET` | `/api/shared/playlists/:id/cover` | `302` to the custom cover, or the first track cover |
| `POST` | `/api/plays` | Body `{ trackId, playlistId?, listenerId, completed? }` → `204`; `404` where the caller cannot listen to that track |
| `GET` · `PUT` · `DELETE` | `/api/shared/playlists/:id/vote` | `VersionVoteState` (voting open, owner or not, this browser's pick): `GET` and `DELETE` take `?voter=<browser id>`, `PUT` takes `{ voterId, trackId, name?, comment? }`; `403` for the owner, `404` unless a shared group (or a version of it), `409` once a version is final |

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
| `NUXT_ANALYTICS_TOKEN` | server only, optional | Vercel access token used to read Web Analytics (Statistics page) — **never commit it** |
| `NUXT_ANALYTICS_PROJECT_ID` | server only, optional | The Vercel project id (`prj_…`) |
| `NUXT_ANALYTICS_TEAM_ID` | server only, optional | The team id (`team_…`), only for a project owned by a team |
| `NUXT_PUBLIC_WEB_ANALYTICS` | browser, optional | Forces loading the Vercel Analytics script on or off (default: on only for builds made on Vercel) |

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

- `routeRules`: rendering modes ([5.4](#54-rendering-modes)) and `no-store` on `/api/**` (the cover routes override it with their own cache header).
- `runtimeConfig.audioStorage`: server-only audio storage settings, filled from `NUXT_AUDIO_STORAGE_*`.
- `runtimeConfig.storageCleanup.minAgeHours`: minimum age of a deletable orphan (24 h).
- `runtimeConfig.analytics`: server-only Vercel Analytics token and project; `runtimeConfig.public.webAnalytics`: load the counting script (builds on Vercel only).
- `supabase.redirectOptions`: login at `/login`, callback at `/confirm`, public pages excluded; `types` points to the generated database types.
- `build.transpile: ['pinia']`: one copy of Pinia in the server bundle (without it, server-rendered pages failed with "no active Pinia").
- `vite.worker.format: 'es'`: the FLAC worker is an ES module worker.
- `vite.optimizeDeps.include`: every package the browser imports (FLAC worker included), pre-bundled when the dev server starts. A package missing from it is discovered on the first visit to a page that imports it, and Vite reloads that page.
- `typescript.appTsConfig.vueCompilerOptions.checkUnknownComponents`: a misnamed component is a type error.
- `pwa`: manifest and a Workbox service worker that caches static assets only (audio comes from signed URLs, covers use the browser cache, the analytics script is left alone).
- `app/assets/css/main.css`: base font size 125% (20 px), 118.75% while the full-screen player is open; on phones (below `sm`, 640 px) 106.25% (17 px, the standard body size on iPhone) everywhere, full-screen player included, so about 15% more fits on a line. Form fields stay at 17 px there (`text-base`), above the 16 px under which iPhones zoom the page on focus.

---

## 11. Local development in detail

### 11.1 Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | **24.11+** (or 22.21+) | `.nvmrc` pins 24; older versions make Nuxt print a warning |
| pnpm | 12 | `npm i -g pnpm@12.14.0` (pinned in `packageManager`); `corepack enable` also works where Node ships Corepack (Homebrew's Node does not) |
| Docker Desktop | recent | Runs the local Supabase stack (and the app in Docker mode) |
| GNU Make | optional | macOS: comes with `xcode-select --install`. Windows: `winget install ezwinports.make` (not part of Git for Windows). Every target has a `pnpm` equivalent |
| Playwright's Chromium | for e2e tests only | Not your own Chrome: Playwright downloads its own (~150 MB, in `~/Library/Caches/ms-playwright` on macOS). `make test-e2e` installs it when missing |

#### From a blank computer

Everything a new computer needs, in order, for **macOS** and **Windows**. Each step says why: every one of them is a problem that really happened.

**Start here, on any system:** once Git and any Node are installed, clone the project and run

```bash
node scripts/doctor.mjs     # later also: pnpm doctor · make doctor
```

It checks Node, pnpm, Docker, the dependencies, `host.docker.internal`, Playwright's Chromium, Make and the local stack, and prints the command that fixes each missing item for the system you are on. It only reads: nothing is installed or changed. Run it again after each step until it says **Ready**.

##### macOS

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
   cd <path>/ChronoPlayer
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
   make local           # → http://localhost:3000
   ```
5. **Docker mode only** (`make docker`, http://localhost:8080): the browser must resolve `host.docker.internal`, and Docker Desktop for Mac never adds it to the hosts file (its setting exists only on Windows). Once per machine, with your password:
   ```bash
   echo "127.0.0.1 host.docker.internal" | sudo tee -a /etc/hosts
   ```
   Without it, sign-in fails with `ERR_NAME_NOT_RESOLVED`. `make local` does not need it.
6. **End-to-end tests:** `make test-e2e`. The first time it downloads Playwright's own Chromium (~150 MB, in `~/Library/Caches/ms-playwright`).

##### Windows (10/11)

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
   pnpm local           # or make local → http://localhost:3000
   ```
   pnpm keeps its store inside the project (`.pnpm-store/`): hard links only work within one drive, so it never creates a store at the root of your drive.
6. **Docker mode only** (`pnpm docker`, http://localhost:8080): the browser must resolve `host.docker.internal`. Docker Desktop for Windows adds it to the hosts file when *Settings → General → "Add the \*.docker.internal names to the host's /etc/hosts file"* is on (the default). Check with `ping host.docker.internal`. If it does not answer, turn the setting on, or open Notepad **as administrator** and add this line at the end of `C:\Windows\System32\drivers\etc\hosts`:
   ```
   127.0.0.1 host.docker.internal
   ```
7. **End-to-end tests:** `make test-e2e` (or `pnpm exec playwright install chromium`, then `pnpm test:e2e`). Playwright's Chromium goes to `%LOCALAPPDATA%\ms-playwright`.
8. If `git commit` fails with "Permission denied", an antivirus is locking files in `.git`: add the project folder to its exclusions.

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

Inside a container `127.0.0.1` is the container itself, so the app reaches Supabase through `host.docker.internal`. The browser uses the same URLs (including the presigned audio URLs), so the host must resolve that name too: Docker Desktop on Windows adds it to the hosts file, on macOS it has to be added once by hand (see [Troubleshooting](#16-troubleshooting)). The script writes them to `.env.docker`. The image is rebuilt on every `pnpm docker` (the pnpm store is a build cache, so rebuilds are fast).

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

### 11.6 Updating dependencies

1. On a branch: `pnpm outdated` lists what is behind; `pnpm update` moves every package to the newest version its range in `package.json` allows, indirect dependencies included. That is the safe step: no major version changes.
2. Then `pnpm check`, and the end-to-end tests on a production build (`pnpm test:e2e`): the waveform (wavesurfer.js), tag reading (music-metadata) and the PWA are only really exercised there.
3. Major versions one at a time, each with the same checks.

**Versions younger than a day are not installed.** pnpm 12 has a supply-chain protection on by default (`minimumReleaseAge`, 24 hours): a compromised release is usually found and pulled within hours, so pnpm waits. A new release (e.g. of the Supabase CLI, which announces itself in the terminal) is simply skipped by `pnpm update` until it is a day old. Asking for it by name (`pnpm add -D pkg@x.y.z`) installs it anyway, but pnpm then writes a `minimumReleaseAgeExclude` list into `pnpm-workspace.yaml`: do not commit it, wait a day instead.

**Major versions held back on purpose** (as of October 2026):

| Package | Stays on | Why |
|---|---|---|
| `typescript` | 6 (`~6.0.3`) | TypeScript 7, the native rewrite, drops the internal files tools load: `vue-tsc` (3.3) fails with `ERR_PACKAGE_PATH_NOT_EXPORTED` (`typescript/lib/tsc`), so `pnpm typecheck` cannot run. Move when `vue-tsc` supports it |
| `h3` | 1 | Nitro, Nuxt 4's server, runs on h3 1 (`^1.15.11`) and the server code uses its helpers (`createError`, `H3Event`); an h3 2 copy next to it would make errors Nitro does not recognise (500s). Move with Nuxt |
| `@vite-pwa/assets-generator` | 1 | `@vite-pwa/nuxt` 1.1 runs on `vite-plugin-pwa` 1, which expects generator 1; it is only used by `pnpm generate:pwa-assets`. Move together with `@vite-pwa/nuxt` |

`pnpm peers check` reports one known mismatch, older than these notes: `@vercel/analytics` declares `vue-router` 4 while the app uses 5. It does not stop the install, the build or the tests; whether page views are counted can only be seen on the Vercel deployment ([7.16](#716-statistics)).

---

## 12. Testing

| Level | Tool | Where | What it covers |
|---|---|---|---|
| Unit | Vitest (Node) | `test/unit/` | LRC parsing and serialization, active-line lookup, peaks, paths, formats, shared helpers (plurals, labels, clamping, list moves, byte arrays), cover crop geometry, Zod schemas (incl. playlist purpose: set at creation only, `playlist` by default), mappers (incl. cover addresses and the shared-track fields common to both public pages); presigned playback URLs and cover removal; **services** (tracks, genres, playlists, sharing, storage clean-up, covers, statistics incl. demo data, plays per day and page with own plays apart, votes and plays tallied per version) with mocked repositories; **when listening becomes a play** (`play-tracker.ts`: 30 s or half, completed at 90%, seeks, pauses and slowed-down playback not counted) and the **listener id** (kept, replaced when corrupted, one per page without storage); the **R2 client** (incl. paginated listing) and the **Vercel Analytics client** (request, rows, errors that never show the token) with a fake fetch; the **player store** with a fake engine (queue and queue editing, races, expired URLs, shared sources, shuffle and repeat in every mode, settings kept across server-rendered pages), the **volume-support probe** (iOS ignores the volume set from JavaScript), the **streaming addresses** (built with the key and expiry, accepted until they expire, refused when the file, the expiry, the signature or the secret differ), **haptics** (pattern passed on, silent without the Vibration API or when refused), the **media card** (cover or app icon, "ChronoPlayer" for a missing artist or album, absolute artwork addresses) and the **play-order rules of shuffle** (`queue-order.ts`, seeded random); **tags for downloads** (FLAC, MP3, WAV written and read back with music-metadata, audio bytes unchanged, previous tags replaced, file names; synced lyrics written and read back as the upload reads them); **WAV → FLAC** with real libFLAC round trips (8/16/24-bit, mono/stereo, full-scale extremes) checked by a second, independent decoder and Node's MD5 |
| Components | Vitest + `@nuxt/test-utils` (happy-dom) | `test/nuxt/` | `useRemotePlayback` with a fake RemotePlayback (available when a device is reported or the browser can only look when asked, not without the API or when refused, connection state, picker outcomes including an instant refusal taken for a browser that cannot cast, the browser's own answer passed on with how fast it came, watch cancelled on unmount and on a new element), `useCloseOnBack` with a fake CloseWatcher (back closes, closing another way drops the watcher, a refused close re-arms it, Esc is left to Nuxt UI, nothing without the API), `LyricsView`, `TrackCover`, `TrackList` (incl. draft badge and selection mode), `PlaylistCover`, `IconButton` (its label names the button, the rest reaches `UButton`, no visible text) |
| Scripts | Vitest (Node) | `test/unit/scripts/` | **`merge:main`** run against throwaway git repositories (a bare repository as the remote): merge and clean-up, every refusal, conflicts; the merge message. **`doctor`**: Node version ranges, the pinned pnpm, Playwright's browser folder per OS, the macOS/Windows fixes |
| Database | pgTAP (`supabase test db`) | `supabase/tests/database/` | RLS across two users and an anonymous visitor, table privileges, constraints, generated columns, sharing functions (fields never exposed, draft/final status and playlist purpose returned), new tracks start as drafts, playlists (curated by default), storage policies; **plays and votes** (where a play may be recorded, own plays kept apart, once a day per listener, votes only on shared groups and never by the owner, closed once a version is final, readable by the owner only, internal helpers not callable); **function privileges** (exactly which functions `anon` and `authenticated` may call, policy helpers out of the API schema and still working) — 107 tests |
| End-to-end | Playwright (Chromium; desktop, phone and tablet projects) | `test/e2e/` | Sign-in/up/out and protected pages; real upload of a 24-bit WAV that must come back from storage as a FLAC with exactly the original samples; float WAV kept; playback, editing, cover, LRC, sync tools, full-screen view, deletion; **track sharing** (no account needed, nothing private leaks, `404` once private); **playlists** (create, add, reorder and reload, play all, share, private tracks only inside the playlist); **queue** (add, play next, move, remove, play now, clear; shuffle reorders Up next and puts it back, repeat one restarts the track; tooltips on icon-only buttons, a menu trigger still opening its menu; the bar's waveform keeps a real width at tablet size) and **saved queue** (a reload resumes track, position and queue; closing the player forgets it); **storage clean-up** (an interrupted upload is found and deleted, the real track keeps its file); **cover cropping** (the stored WebP holds exactly the chosen square, checked on its pixels); **download** (the saved FLAC carries title, artist, album, year, genre, comment, lyrics and cover, never the Suno prompt); **synced lyrics transfer** (LRC opened from a file, copied and downloaded; a downloaded FLAC uploaded into another account brings its sync back); **cover cache** (stable address across reloads, one-year private cache header, new address for a new cover, `401`/`404` for anyone but the owner); **statistics** (demo data flagged outside Vercel, built around the user's track, no analytics script loaded, period switch, `400`/`401` from the API); **draft versions** (uploads are drafts, two versions shared for feedback and seen as WIP by a visitor, the group on the Versions page and not among the playlists, one marked final from the group, the version filter, the other drafts deleted in one go); **listeners' feedback** (`feedback.spec.ts`: a friend listens to a version to the end and picks another with a name and a note, kept across a reload; the owner gets a note instead of hearts and a `403` for a vote; the Versions page shows votes, plays and the note; marking a version final closes the voting for the friend, with the chosen one shown; plays of a private track outside its group refused; Statistics count the friend's play and none of the owner's); **streaming address** (`streaming.spec.ts`: HEAD answered with the stored file's type and size, GET redirected to the storage with range requests, forged or altered addresses refused); **touch screens** (`responsive.spec.ts`, run by its own `phone` and `tablet` projects: no page scrolls sideways, the base text is 17 px on phones and 20 px on tablets, the track editor's title keeps a real width on phones, covers show their play button without a hover, the tablet player bar keeps a readable title and opens the volume in a popover, Stamp line stays pinned above the player bar on phones; on phones also, with real touch events sent through the DevTools protocol, a real CloseWatcher and recorders for vibration, wake lock and share sheet: swipes change track and open the player, a pull-down closes it and the view fits a long title, back closes Up next before the full-screen view, the screen stays on while syncing and is released on leaving the tab, stamp and undo vibrate, share links open the share sheet, the lock-screen card read from the browser's real Media Session shows the title and the app, and the Cast button, against a stand-in for a Chromecast, opens the picker and shows the connection, and with no device at all the button is still there on phones and tablets and explains, when tapped, that casting is not available here, with the browser's answer; the phones' full-screen view shows the description under the controls and no Lyrics button for a track without lyrics, and the Lyrics button opens the lyrics view, with the lyrics scrolling in their own box, the controls on screen, the screen kept on only while it plays, and the choice kept across a reload; opening the view focuses the view itself, with no tooltip showing) |

```bash
make test                 # unit + components (seconds)
make db-test              # database (local Supabase running)
make test-e2e             # end-to-end on a production build (:3100) + local Supabase
E2E_DEV=1 pnpm test:e2e   # end-to-end against the dev server (:3000)
make ci                   # everything the CI runs
```

- E2E tests generate WAV files on the fly and register throwaway users (`e2e-…@chronoplayer.test`) in the local database; they do not touch your own data.
- **Wait for the server, not for a toast, before relying on a save.** A success toast stays on screen for a few seconds, so after a second save with the same message ("Changes saved", "Cover updated") the toast assertion passes before the request has finished. `clickAndWaitForApi(page, control, { method, path })` (`test/e2e/helpers.ts`) clicks and waits for that request's successful response.
- pgTAP tests run inside a transaction that is rolled back: they never change the database.
- **Projects:** `chromium` (desktop) runs every spec except `responsive.spec.ts`; `phone` (Pixel 7 emulation) and `tablet` (820×1180, touch) run only that one, since the other specs drive the desktop layout. Run a single one with `--project phone`.
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

### 13.6 Statistics (Vercel Web Analytics)

Optional. Without it the app works as usual and the Statistics page explains what is missing.

1. Vercel → the project → **Analytics** → *Enable* (Web Analytics). The package step it suggests is already done in this repository.
2. Vercel → **Account Settings → Tokens** → *Create*: scope it to the account or team that owns the project, and give it an expiration. The token can do more than read statistics: it lives only in the server environment, never in the code or in a `NUXT_PUBLIC_*` variable.
3. The project's **Settings → General** shows the *Project ID* (`prj_…`); for a project owned by a team, the team's settings show the *Team ID* (`team_…`).
4. *Environment Variables* (Production): `NUXT_ANALYTICS_TOKEN` (mark it *Sensitive*), `NUXT_ANALYTICS_PROJECT_ID`, and `NUXT_ANALYTICS_TEAM_ID` if needed. Redeploy.
5. Open a share link in a private window (signed out), wait a few minutes, then open Statistics.

On the Hobby plan Web Analytics includes 50,000 events a month and keeps one month of data (hence the 7/30-day periods); only share pages are counted, so the allowance goes a long way.

### 13.7 Keeping Supabase awake

Supabase **pauses a Free-plan project after a week without database activity** ([Supabase: Project Pausing](https://supabase.com/docs/guides/platform/project-pausing)): sign-in, the library and the share links stop working (the audio stays on R2, but nobody can get its addresses) until the project is restored by hand. A week of holidays without opening the app, and no visitors on the share links, would be enough.

Nothing to set up: `vercel.json` declares a **Vercel Cron** job that calls `GET /api/keepalive` every day at 06:00 UTC (the Hobby plan allows daily jobs, run at some point within that hour). The route reads one built-in genre as the anonymous role, which is real database activity; `/api/health` would not do, since it never reaches the database. The route needs no secret: anyone holding the public Supabase key can already read the built-in genres straight from Supabase.

- **Check it:** Vercel → the project → **Settings → Cron Jobs** lists the job, with *Run* to try it at once and a link to its logs. Cron jobs run on the production deployment only.
- **If Supabase pauses the project anyway** (an email warns about a week before, and another confirms the pause): Supabase dashboard → the project → *Restore*. Then check the Cron Jobs page: a failing job (500 in its logs) means the database was not reached.

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
| Ready | Shows the commits and the merge message, asks `[y/N]` (`pnpm merge:main --yes` or `make merge yes=1` skip the question) |
| Confirmed | Updates `main`, merges with a merge commit (`--no-ff`), pushes `main` (production deploy on Vercel), deletes the branch on GitHub and locally, leaves you on `main` in sync |
| Merge conflicts | The merge is aborted and you are back on your branch, unchanged: merge `main` into it, fix, push, run again |
| Pushing `main` fails | The merge stays local and the branch is kept; run `git push` on `main` |

The merge commit message sums up the branch: the commit subject when there is a single commit (`Merge feat/x: Add an editable play queue`), otherwise `Merge feat/x (N commits)` followed by one line per commit, oldest first, with repeated subjects grouped.

R2 accepts uploads only from the origins in its CORS policy: uploads from a Vercel **preview** URL fail unless that origin is added too. Playback and everything else work on previews.

### 14.2 Code conventions

- **Language:** everything in the repository is in English (code, comments, docs, UI text, commit messages).
- **Comments, in depth:** every file starts with what it is for and how it fits in; every function, exported constant, type field and non-trivial computed/watch has a doc comment; non-obvious lines explain *why*; the main blocks of Vue templates are labelled; tests describe their fixtures and scenarios. SQL migrations get comments only — their statements never change once applied.
- **Style:** ESLint with stylistic rules, no Prettier (2 spaces, no semicolons, single quotes). `make lint-fix` fixes what it can; VS Code fixes on save (`.vscode/settings.json`).
- **Components:** Nuxt prefixes a component with its folder (`components/track/TrackCover.vue` → `<TrackCover>`); files already carry the full name, and the typecheck flags unknown components.
- **New endpoint:** a route in `server/api/` only authenticates (`requireAuth`, or `visitorClient` for public routes), validates (`readValidated`, `requireUuidParam`) and calls a service. Rules live in the service, tested without Nuxt; queries in a repository; conversions in a mapper.
- **New table or column:** migration (RLS policies + explicit `grant`s) → `make db-migrate` → pgTAP tests → `make db-types` → mapper → repository → service → route → `app/services/api.ts`.
- **Shared code:** anything both sides need goes in `shared/` (pure code: no browser or Node APIs).
- **Reuse before writing:** API calls behind a button go through `useAsyncTask`, edit forms through `useEditForm`, covers through `useCoverEditor`, labels through `pluralize` / `joinParts`… The full list is in [5.5](#55-reusable-building-blocks); a pattern that appears a second time becomes a helper there.
- **Icon-only buttons** are `<IconButton label="…">`, never a bare `UButton` with an `aria-label`: the label becomes the tooltip too, so mouse users see what screen readers hear. A button that shows its text from `sm` up keeps `UButton` + `aria-label` (a tooltip would repeat it). Other meaningful icons (status badges, grips) get a `UTooltip` with `:content="{ side: 'top' }"`, like `IconButton`: above the element (the player bar sits at the bottom of the screen), below when there is no room above. A tooltip that can open over something clickable also gets `disable-hoverable-content`, as `IconButton` does. Tooltips do not open on touch or on disabled buttons, so never put information *only* in a tooltip.
- **Never** use the Supabase service key in the app, and never put storage credentials in client code or in git.

---

## 15. Known limitations and next steps

### 15.1 Known limitations

- **The queue is per device:** it is saved in the browser, not in the account.
- **Storage clean-up is manual** (Storage dialog): nothing removes orphaned files on a schedule.
- **The Supabase project stays awake only through a daily job** on Vercel ([13.7](#137-keeping-supabase-awake)): a deployment elsewhere (Docker on a server) has no cron, and needs its own daily call to `/api/keepalive`.
- **No library pagination:** everything loads at once, fine up to a few hundred tracks.
- **No offline mode** (downloading tracks for listening without a connection).
- **Downloads of OGG/Opus, M4A/AAC and WebM files carry no tags**, and WAV downloads have no cover or lyrics (no standard place for them).
- **Revoked links:** an audio URL already handed out stays valid until it expires (up to 6 hours).
- **Page views come from Vercel** only: one month of data, visitors with an ad blocker missed, real numbers only on the Vercel deployment. Plays are the app's own count and have none of these limits.
- **Listeners and voters are browsers, not people:** one person on two devices counts twice, and clearing the site's data (or a private window) gives a new id, so a determined friend could vote twice. Fine among friends; not a secure ballot.
- **Casting sends the audio only** ([7.5](#75-playback)): the Remote Playback API hands the device an audio address and no track data, so a Chromecast / Google TV is not expected to show cover, track info or lyrics (not yet checked on a device), and the queue moves on only while the phone's page is alive (the phone's `<audio>` element drives the cast). Devices without Google Cast or AirPlay (most Samsung and LG TVs, DLNA speakers) cannot be reached from a web app at all.

### 15.2 Next steps

- **A check for `vite.optimizeDeps.include`:** a unit test that reads the packages imported by `app/` and `shared/` and fails when one is missing from the list ([10.3](#103-notable-nuxtconfigts-settings)). Today a new browser dependency left out of it is noticed only on the dev server, as a reload on the first visit to the page that imports it.
- **Audio quality on screen:** format, bit depth and sample rate on the track page, a "Lossless, verified" badge for FLACs that passed the three checks of [7.4](#74-lossless-wav--flac-conversion), and a hint in the player when the volume is below 100% (it is remembered between visits). Bit depth and sample rate are not stored today: this needs a migration, and tracks uploaded before it have no values.
- **A TV page (`/tv`), the universal way to play on a TV** (a Spotify Connect of our own). TVs speak different casting protocols (Google Cast, AirPlay, DLNA) and a web app reaches only the first two, and only from browsers that offer them to pages: **Opera on Android does not** (it casts only from its own video player), so the Cast button cannot work there ([7.5](#75-playback)). What makes Spotify work everywhere is an app on each TV, with the phone as a remote; here the app on the TV is a page of ChronoPlayer, and the phone only sends commands over the internet. So it works from **any phone browser, Opera included**, and even with the phone away from the home Wi-Fi.
  - **using it:** the TV shows a short code (`K7P-4QX`) once; "Play on… → Add a TV" in the phone's player asks for it. From then on a device picker in the player ("This phone" / "TCL TV") moves the queue to the TV from where it was. The TV plays the queue by itself (even with the phone locked or off) and shows cover, track info and the **synced lyrics** in a landscape layout, with focus and remote-control (D-pad) navigation; the phone is the remote (play/pause, previous/next, seek, queue, volume) and shows "Playing on TCL TV". Picking "This phone" brings playback back where it was;
  - **pairing and access:** the TV signs in with a Supabase **anonymous** session, so it knows nothing about the account until paired. The code lives a few minutes; confirming it from the phone stores "this TV belongs to this user" in a table (`tv_devices`: owner, name, last seen) under RLS like the rest of the data, and the pairing can be revoked from the phone. The TV then gets audio addresses only for the tracks the phone sends it (an API route checking the pairing signs them, and signs them again when they expire), so private tracks stay private;
  - **plumbing:** a private **Supabase Realtime** channel per paired TV (already in the stack): commands from phone to TV, state (track, position, playing) from TV to phone, and presence to tell whether the TV is on. A few tenths of a second of delay, fine for a remote. No new service, no registration, no cost on the free tier;
  - **in the code:** the player store already plays through a `PlaybackEngine` interface; a **remote engine** next to the local one sends commands and receives the state instead of playing, so the whole phone interface (bar, full-screen view, lock screen, swipes) stays as it is. The TV page reuses `LyricsView`, `TrackCover` and the waveform, with its own `<audio>` element;
  - **getting it onto a Google TV:** Google TV ships without a web browser, so the page needs a **small Android TV app**: a full-screen WebView opening `/tv`, starting audio without a key press (`mediaPlaybackRequiresUserGesture` off), keeping the screen on (`FLAG_KEEP_SCREEN_ON`) and passing the remote's keys to the page; a few dozen lines of Kotlin. Installed for free by sideloading the APK (once, with an app such as Downloader or from a computer, after allowing unknown sources), or through the Play Store with a Google Play developer account (US$25 one-time, not needed for personal use). Without any app: install a TV browser (e.g. TV Bro) and open `/tv`, less comfortable (a key press to start audio, a bookmark to open, no guarantee about the screensaver). On TVs that do have a browser (Samsung, LG, Fire TV, consoles, a PC on the TV) the page alone is enough;
  - **testable:** unlike Cast, the whole flow runs in the end-to-end tests with two browser contexts, a phone and a TV;
  - **to check first, on the TV:** which audio formats it plays (FLAC is the likeliest gap, though Android TV's Chromium-based WebView normally plays it: a missing codec would need an MP3 copy of each track, which the app does not make today), that audio starts on its own (or after one press of OK, in a plain browser), and that the screensaver stays away during playback;
  - **in stages, each usable on its own:** 1) a one-page check (`/tv/check`: formats, autoplay, screen kept on) on the actual TV; 2) the TV page and pairing, playing a queue sent from the phone (from here music and lyrics are on the TV); 3) the phone as a remote (device picker, remote engine, synced state); 4) the Android TV app. A large piece of work, mostly stages 2 and 3; until then, **Android's screen mirroring** (quick settings → Screen cast / Smart View → the TV) works from any browser today: the TV shows the phone's screen, lyrics view included, and plays its sound, with the phone kept on.
- **Richer casting to Google Cast devices** (Chromecast, Google TV, Android TVs with Chromecast built in), in steps:
  - **Cast SDK with Google's default receiver (free):** cover, title, artist and album on the TV, and the whole queue handed to it, so it moves on by itself with the phone off. It replaces the Remote Playback API for Chrome-based browsers (the store already plays through a `PlaybackEngine` interface, so a Cast engine can sit beside the local one); AirPlay keeps the current path. Opera and other browsers without Cast built in are left out;
  - **synced lyrics as subtitles (free, to try):** the lyrics turned into a WebVTT text track attached to the cast audio; whether the default receiver shows subtitles for audio-only media has to be checked on a device;
  - **a ChronoPlayer receiver (US$5 one-time):** a page of the app running on the TV, showing cover, info and synced lyrics like the full-screen player. It needs a one-time registration in the Google Cast SDK Developer Console for an App ID (set through an environment variable), and, until the receiver is published, the TV's serial number registered there.

---

## 16. Troubleshooting

| Problem | Solution |
|---|---|
| `Current version of Node.js … is unsupported` | Upgrade Node to 24.11+ (`nvm install 24`) |
| `pnpm: command not found` (e.g. from `make docker`) | pnpm is not installed for the Node in use: `npm i -g pnpm@12.14.0 --allow-scripts=pnpm`. With nvm (or nvm-windows), repeat it after installing a new Node version |
| `Cannot find native binding` / `postinstall: nuxt prepare exited with status 1` | Node is too old (e.g. Homebrew's 22.9): `pnpm install` skipped rolldown's native package. Switch to Node 24 (`nvm use`, or `nvm use 24` on Windows), then `pnpm install` again |
| Windows: `nvm use` says "exit status 1" or access denied | Run the terminal as administrator, or turn on Developer Mode (Settings → System → For developers) |
| `source ~/.zshrc` prints `command not found: compdef` (macOS) | Another tool's completion runs before zsh's: add `autoload -Uz compinit && compinit` on the line before it |
| `npm warn install-scripts … pnpm@12.14.0` | Harmless: pnpm works without its install script. `npm i -g pnpm@12.14.0 --allow-scripts=pnpm` silences it and uses the native binary |
| "Docker is not running" | Open Docker Desktop and wait for the engine; if it hangs while starting, use **Restart** from its tray menu. Windows: if it complains about WSL, run `wsl --update` in an administrator PowerShell |
| `supabase start` fails | Docker must be running; `pnpm db:stop`, then try again |
| Always sent back to `/login` locally | `.env` missing or stale: `make env`, then restart the dev server |
| `pnpm docker`: sign-in fails with `ERR_NAME_NOT_RESOLVED` on `host.docker.internal` | The host must resolve `host.docker.internal`. **macOS:** `echo "127.0.0.1 host.docker.internal" \| sudo tee -a /etc/hosts` (Docker Desktop for Mac never adds it). **Windows:** Docker Desktop → Settings → General → "Add the *.docker.internal names to the host's /etc/hosts file", or add `127.0.0.1 host.docker.internal` to `C:\Windows\System32\drivers\etc\hosts` with Notepad run as administrator. Or use `pnpm local`, which needs neither |
| Forgot the local login | Use the demo account, or look at Authentication → Users in Studio (http://127.0.0.1:54323) |
| `Failed to load because no supported source was found` | The audio URL could not be loaded (expired or wrong storage settings): press play again; if it persists check the `NUXT_AUDIO_STORAGE_*` values |
| `Audio format not supported` | The browser lacks that codec (e.g. some OGG files on older Safari). The file stays saved. |
| `Audio storage is not configured` (HTTP 500) | A `NUXT_AUDIO_STORAGE_*` variable is missing (Vercel settings, or `make env` locally) |
| Upload fails online with a CORS error | Add the site's origin (with `https://`) to the R2 CORS policy, then `pnpm r2:check https://<your-domain>` |
| R2 says "JSON not well formatted" when saving CORS | Paste exactly the JSON array of 13.2, with straight quotes |
| Sign-up email link leads to localhost | Set Site URL and Redirect URLs in Supabase (13.4) |
| A share link answers "not available" | The item is private (or the saved visibility is still private): set Unlisted/Public and **save** |
| Phone: nothing about the track on the lock screen | With the screen off Android shows nothing (always-on display aside, a phone setting). On the lock screen, check Settings → Notifications (or Sound) → "Show media on lock screen", and that the browser's notifications are not blocked |
| Phone: Cast says "Casting is not available here" | The browser refused. Read **the browser's answer** at the end of the message: `NotAllowedError … (a few ms)` with no picker shown means no casting service (Opera, Firefox and other browsers on Android cannot reach a Chromecast); `NotSupportedError` means the browser will not cast this audio, or not from here (e.g. try a Chrome tab instead of the installed app). Which browsers can: the table at the end of [7.5](#75-playback). **Temporary diagnostic page `/cast-test`** (signed in, linked from nowhere): five variants (the player's detached `<audio>`, an `<audio>` and a `<video>` in the page, and a static WAV, `public/cast-test.wav`, in both), each with its own Cast button and the browser's answers, and "Copy results". On a TCL Google TV none of them ever saw the TV (only the `<video>` rows opened a picker, which found nothing), while Chrome's own "Cast…" menu lists it; so a sixth row tries the **Google Cast Web Sender SDK** (`app/lib/google-cast.ts`, the route of that menu) with Google's default receiver: connect, then send the track or the WAV, and read the TV's player state in its log. Remove the page and the WAV once casting works |
| Phone: Cast says "No devices found" | The TV or speaker must have Chromecast built in (Android) or AirPlay (iPhone, iPad), be on, and be on the **same Wi-Fi**. TVs without either: use Android's screen mirroring. Bluetooth speakers need no button: pair them in Android's settings |
| Database types out of date | `make db-types` after every migration |
| First page load in `make dev` is very slow | Expected: Vite compiles dependencies on the first request |
| Dev server: `Vite discovered new dependencies at runtime`, then the page reloads | A package the browser imports is missing from `vite.optimizeDeps.include` in `nuxt.config.ts` ([10.3](#103-notable-nuxtconfigts-settings)): add the names the message lists |
| Vercel: a deployment is **Blocked** | The commit author's email is not one of your GitHub account's (e.g. a work computer's global git identity). Use your own for this repository: `git config user.email <your GitHub email>`. For every personal project in one folder, add to `~/.gitconfig` `[includeIf "gitdir:~/Projects/others/"]` with `path = ~/.gitconfig-personal`, a file holding your `[user]` name and email. Then push a new commit: it deploys everything before it, so the blocked ones need nothing else |
| E2E tests test an old version | A server is still running on :3100: stop it, Playwright then builds afresh |
| Every e2e test fails at once with `browserType.launch: Executable doesn't exist` | Playwright's Chromium is missing (new computer, or a Playwright update): `pnpm exec playwright install chromium`. `make test-e2e` does it for you (macOS: `~/Library/Caches/ms-playwright`, Windows: `%LOCALAPPDATA%\ms-playwright`) |
| Browser console: `preload … not used because it is a cross-world service worker resource mismatch` | Harmless: the PWA service worker serves files Chrome had already preloaded. Absent in `make local` (no service worker in development); DevTools → Application → Service workers → "Bypass for network" hides it on :8080 |
| Browser console: errors from `VM123:…` scripts (e.g. `reading 'startTime'` in `reportAllChanges`) | A browser extension, not the app (app files are `/_nuxt/….js`). A private window, without extensions, confirms it |
| `git commit`: "Permission denied" on Windows | An antivirus may lock files in `.git`: add the project folder to its exclusions |
| `make` not found on Windows | `winget install ezwinports.make`, then reopen Git Bash; or use the equivalent `pnpm` commands |
| Not sure what is missing on a new computer | `node scripts/doctor.mjs` (or `pnpm doctor`, `make doctor`): checks every prerequisite and prints the fix for your system |
