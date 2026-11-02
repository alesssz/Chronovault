# 13. Deployment (Supabase + Cloudflare R2 + Vercel)

## 13.1 Supabase Cloud

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

## 13.2 Cloudflare R2 (audio files)

Dashboard labels may change slightly over time.

1. **R2 Object Storage**: enable R2 (Cloudflare may ask for a payment method even within the free tier).
2. **Create bucket** `chronovault-audio`, location *Automatic*, storage class *Standard*. Keep public access **disabled**.
3. **Bucket → Settings → CORS policy** (the browser uploads with PUT and streams with GET + `Range`):
   ```json
   [
     {
       "AllowedOrigins": ["http://localhost:3100", "https://<your-domain>"],
       "AllowedMethods": ["GET", "HEAD", "PUT"],
       "AllowedHeaders": ["content-type", "range"],
       "ExposeHeaders": ["ETag", "Content-Length", "Content-Range", "Accept-Ranges"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```
   Origins must include the scheme (`https://`) and no trailing slash.
4. **Manage API tokens → Create API token**: permission *Object Read & Write*, restricted to `chronovault-audio`. Copy the *Access Key ID*, the *Secret Access Key* (shown once) and the S3 endpoint `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`. The "Token value" is not needed.
5. Copy `.env.r2.example` to `.env.r2`, fill it in and run `pnpm r2:check`: every line must be ✔.

## 13.3 Vercel

1. Import the GitHub repository: the Nuxt preset is detected automatically.
2. *Environment Variables*: `SUPABASE_URL`, `SUPABASE_KEY` and the five `NUXT_AUDIO_STORAGE_*` values from `.env.r2`.
3. *Settings → Node.js Version* (under "Build and Deployment" or "General", depending on the dashboard version): 24.x.
4. pnpm is pinned in `packageManager`; if Vercel does not pick it up, add `ENABLE_EXPERIMENTAL_COREPACK=1`.
5. Deploy and open `https://<your-domain>/api/health`. Every push to `main` deploys again automatically.
6. The functions run in **London (`lhr1`)**, set in `nuxt.config.ts` (`nitro.vercel.functions.regions`), next to the Supabase project (eu-west-2): every API call reaches the database several times. A Supabase project in another region needs the nearest [Vercel region](https://vercel.com/docs/regions) there instead. Check it: the deployment's *Functions* tab shows the region.

## 13.4 After the first deploy

1. Supabase → **Authentication → URL Configuration**: *Site URL* `https://<your-domain>`, *Redirect URLs* `https://<your-domain>/confirm`.
2. Add `https://<your-domain>` to the R2 CORS origins (if not done yet) and run `pnpm r2:check https://<your-domain>`.
3. **Personal use:** create your account from the Supabase dashboard (Authentication → Users → Add user, *Auto Confirm User*), then turn off **Allow new users to sign up** (Authentication → Sign In / Providers). Nobody else can then create an account; shared links keep working without one.
4. Upload a track online and open it in a private window via its share link.

## 13.5 Updating production

- **Code only:** commit and push to `main`; Vercel deploys.
- **With a new migration:** `make db-push` first (so the new code finds the new schema), then commit and push. Vercel never touches the database.
- Writing a migration: `make db-migration name=<description>` → write the SQL → `make db-migrate` → `make db-test` → `make db-types`.
- A new **SQL function**: decide who may call it ([8.3](08-data-model-and-security.md#83-database-functions)). Meant for the API: keep it in `public`, revoke it from `public` and grant it to the roles that need it. A helper of other functions: revoke it from `public`, `anon` and `authenticated` by name. A helper of policies: create it in `private`. Then add API functions to the lists in `function_privileges.test.sql`, or `make db-test` fails.

## 13.6 Statistics (Vercel Web Analytics)

Optional. Without it the app works as usual and the Statistics page explains what is missing.

1. Vercel → the project → **Analytics** → *Enable* (Web Analytics). The package step it suggests is already done in this repository.
2. Vercel → **Account Settings → Tokens** → *Create*: scope it to the account or team that owns the project, and give it an expiration. The token can do more than read statistics: it lives only in the server environment, never in the code or in a `NUXT_PUBLIC_*` variable.
3. The project's **Settings → General** shows the *Project ID* (`prj_…`); for a project owned by a team, the team's settings show the *Team ID* (`team_…`).
4. *Environment Variables* (Production): `NUXT_ANALYTICS_TOKEN` (mark it *Sensitive*), `NUXT_ANALYTICS_PROJECT_ID`, and `NUXT_ANALYTICS_TEAM_ID` if needed. Redeploy.
5. Open a share link in a private window (signed out), wait a few minutes, then open Statistics.

On the Hobby plan Web Analytics includes 50,000 events a month and keeps one month of data (hence the 7/30-day periods); only share pages are counted, so the allowance goes a long way.

## 13.7 Keeping Supabase awake

Supabase **pauses a Free-plan project after a week without database activity** ([Supabase: Project Pausing](https://supabase.com/docs/guides/platform/project-pausing)): sign-in, the library and the share links stop working (the audio stays on R2, but nobody can get its addresses) until the project is restored by hand. A week of holidays without opening the app, and no visitors on the share links, would be enough.

Nothing to set up: `vercel.json` declares a **Vercel Cron** job that calls `GET /api/keepalive` every day at 06:00 UTC (the Hobby plan allows daily jobs, run at some point within that hour). The route reads one built-in genre as the anonymous role, which is real database activity; `/api/health` would not do, since it never reaches the database. The route needs no secret: anyone holding the public Supabase key can already read the built-in genres straight from Supabase.

- **Check it:** Vercel → the project → **Settings → Cron Jobs** lists the job, with *Run* to try it at once and a link to its logs. Cron jobs run on the production deployment only.
- **If Supabase pauses the project anyway** (an email warns about a week before, and another confirms the pause): Supabase dashboard → the project → *Restore*. Then check the Cron Jobs page: a failing job (500 in its logs) means the database was not reached.

---

← [12. Testing](12-testing.md) · [Contents](../README.md#documentation) · [14. Development conventions](14-conventions.md) →
