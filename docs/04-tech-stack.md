# 4. Tech stack

| Layer | Technology | Notes |
|---|---|---|
| Framework | **Nuxt 4.6** (Vue 3.5, Vite, Nitro) | Frontend and backend in one project; `app/` is the source directory |
| Language | **TypeScript 6** (strict) | Database types generated from the schema (`pnpm db:types`) |
| UI | **Nuxt UI 4** + Tailwind CSS 4 | Accessible components (Reka UI), Lucide icons via Iconify, light/dark mode, the Chronovault colours as custom scales ([5.6](05-architecture.md#56-brand-and-theme)) |
| Fonts | **Inter** (text) + **Cinzel** (the name) | Served by the app itself through `@nuxt/fonts`, which Nuxt UI enables |
| State | **Pinia 4** | One store: the player |
| Utilities | **VueUse 15** (+ `@vueuse/integrations` with **SortableJS**) | Event listeners, drag-and-drop reordering |
| Long lists | **TanStack Virtual 3** (`@tanstack/vue-virtual`) | The library's virtual scroll (window virtualizer, [7.2](07-data-flows.md#72-loading-the-library)); the same copy Nuxt UI uses inside |
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
| Brand images | **sharp** (development only) | Draws the favicon, the PWA icons and the fallback cover (`pnpm generate:brand`); the results are committed |
| Tests | **Vitest 5**, **@nuxt/test-utils**, **Playwright**, **pgTAP** | Unit, components, end-to-end, database |
| Code quality | ESLint 10 (`@nuxt/eslint`, stylistic rules, no Prettier), vue-tsc | |
| Package manager | **pnpm 12** | Store inside the project (`.pnpm-store/`) |
| Containers | Docker (multi-stage `Dockerfile`, `compose.yaml`) | Local production-like run |
| Hosting | **Vercel** (app) · **Supabase Cloud** (data) · **Cloudflare R2** (audio) | All on free plans |
| CI | GitHub Actions | Lint, types, unit, database and end-to-end tests |

---

← [3. Commands](03-commands.md) · [Contents](../README.md#documentation) · [5. Architecture](05-architecture.md) →
