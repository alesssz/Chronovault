# 10. Configuration

## 10.1 Environment variables

| Variable | Used by | Description |
|---|---|---|
| `SUPABASE_URL` | browser + server | Supabase project URL (local: `http://127.0.0.1:54321`) |
| `SUPABASE_KEY` | browser + server | **Public** key (publishable / anon) |
| `NUXT_AUDIO_STORAGE_ENDPOINT` | server only | S3 endpoint: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` in production, `http://127.0.0.1:54321/storage/v1/s3` locally |
| `NUXT_AUDIO_STORAGE_REGION` | server only | `auto` for R2, `local` locally |
| `NUXT_AUDIO_STORAGE_BUCKET` | server only | `chronovault-audio` on R2, `audio` locally |
| `NUXT_AUDIO_STORAGE_ACCESS_KEY_ID` | server only | R2 API token key id |
| `NUXT_AUDIO_STORAGE_SECRET_ACCESS_KEY` | server only | R2 API token secret — **never commit it** |
| `NUXT_STORAGE_CLEANUP_MIN_AGE_HOURS` | server only, optional | Orphaned files younger than this are never deleted (default `24`; the e2e server uses `0`) |
| `NUXT_ANALYTICS_TOKEN` | server only, optional | Vercel access token used to read Web Analytics (Statistics page) — **never commit it** |
| `NUXT_ANALYTICS_PROJECT_ID` | server only, optional | The Vercel project id (`prj_…`) |
| `NUXT_ANALYTICS_TEAM_ID` | server only, optional | The team id (`team_…`), only for a project owned by a team |
| `NUXT_PUBLIC_WEB_ANALYTICS` | browser, optional | Forces loading the Vercel Analytics script on or off (default: on only for builds made on Vercel) |

In the Docker mode the Supabase variables are named `NUXT_PUBLIC_SUPABASE_URL` / `NUXT_PUBLIC_SUPABASE_KEY` (runtime overrides of the build-time values). A missing audio storage variable makes audio routes answer `500 Audio storage is not configured` and logs which one is missing.

## 10.2 Env files

| File | Git | Written by | Used by |
|---|---|---|---|
| `.env` | ignored | `pnpm local`, `pnpm env:local` | `pnpm dev`, e2e tests (`node --env-file=.env`) |
| `.env.docker` | ignored | `pnpm docker` | The app container (`compose.yaml`) |
| `.env.r2` | ignored | you, from `.env.r2.example` | `pnpm r2:check` |
| `.env.example` · `.env.r2.example` | committed | — | Templates with explanations |

`writeEnvFile` only updates the variables it manages: other lines you add to `.env` are kept.

## 10.3 Notable `nuxt.config.ts` settings

- `routeRules`: rendering modes ([5.4](05-architecture.md#54-rendering-modes)), `no-store` on `/api/**` (the cover routes override it with their own cache header) and the fixed security headers on `/**` ([8.5](08-data-model-and-security.md#85-security-guarantees)); the Content Security Policy needs a nonce per page, so a Nitro plugin sends it instead.
- `runtimeConfig.audioStorage`: server-only audio storage settings, filled from `NUXT_AUDIO_STORAGE_*`.
- `runtimeConfig.storageCleanup.minAgeHours`: minimum age of a deletable orphan (24 h).
- `runtimeConfig.analytics`: server-only Vercel Analytics token and project; `runtimeConfig.public.webAnalytics`: load the counting script (builds on Vercel only).
- `supabase.redirectOptions`: login at `/login`, callback at `/confirm`, public pages excluded; `types` points to the generated database types.
- `build.transpile: ['pinia']`: one copy of Pinia in the server bundle (without it, server-rendered pages failed with "no active Pinia").
- `vite.worker.format: 'es'`: the FLAC worker is an ES module worker.
- `vite.optimizeDeps.include`: every package the browser imports (FLAC worker included), pre-bundled when the dev server starts. A package missing from it is discovered on the first visit to a page that imports it, and Vite reloads that page. The list is kept by hand, and **checked by a unit test** (`test/unit/config/optimize-deps.test.ts`): it reads the runtime imports of `app/` and `shared/` (type-only imports, local and aliased paths and `?url` assets left out) and fails, naming the package and the files importing it, when one is missing, or when the list names a package nothing imports any more. `vue`, `vue-router` and `pinia` are not listed on purpose: Nuxt and `@pinia/nuxt` exclude them from pre-bundling themselves, so they never cause a reload.
- `typescript.appTsConfig.vueCompilerOptions.checkUnknownComponents`: a misnamed component is a type error.
- `app.head` and `pwa.manifest`: name, description and night-blue theme colour from `shared/brand.ts` ([5.6](05-architecture.md#56-brand-and-theme)).
- `pwa`: manifest and a Workbox service worker that caches static assets only (audio comes from signed URLs, covers use the browser cache, the analytics script is left alone); `webp` is among them for the fallback cover.
- `app/assets/css/main.css`: base font size 125% (20 px), 118.75% while the full-screen player is open; on phones (below `sm`, 640 px) 106.25% (17 px, the standard body size on iPhone) everywhere, full-screen player included, so about 15% more fits on a line. Form fields stay at 17 px there (`text-base`), above the 16 px under which iPhones zoom the page on focus.

---

← [9. API reference](09-api-reference.md) · [Contents](../README.md#documentation) · [11. Local development in detail](11-local-development.md) →
