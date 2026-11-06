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
5. Copy `.env.r2.example` to `.env.r2`, fill it in by hand from Cloudflare and run `pnpm r2:check`: every line must be ✔. The endpoint is the bucket's "S3 API" address without the bucket name (`https://<account id>.r2.cloudflarestorage.com`). Vercel cannot give the values back once they are marked "Sensitive" (it shows `[SENSITIVE]`), and a token's secret access key is shown only once, when the token is made: on another computer, make a new R2 API token ("Object Read & Write" on the bucket) for its `.env.r2`; the app keeps its own token. `r2:check` and `flac:seektable` name an empty value, a placeholder or an endpoint that is no URL before any request.

## 13.3 Vercel

1. Import the GitHub repository: the Nuxt preset is detected automatically.
2. *Environment Variables*: `SUPABASE_URL`, `SUPABASE_KEY` and the five `NUXT_AUDIO_STORAGE_*` values from `.env.r2`.
3. *Settings → Node.js Version* (under "Build and Deployment" or "General", depending on the dashboard version): 24.x.
4. pnpm is pinned in `packageManager`; if Vercel does not pick it up, add `ENABLE_EXPERIMENTAL_COREPACK=1`.
5. Deploy and open `https://<your-domain>/api/health`. Every push to `main` deploys again automatically.
6. The functions run in **London (`lhr1`)**, set in `nuxt.config.ts` (`nitro.vercel.functions.regions`), next to the Supabase project (eu-west-2): every API call reaches the database several times. A Supabase project in another region needs the nearest [Vercel region](https://vercel.com/docs/regions) there instead. Check it: the deployment's *Functions* tab shows the region.

## 13.4 After the first deploy

1. Supabase → **Authentication → URL Configuration**: *Site URL* `https://<your-domain>`, *Redirect URLs* `https://<your-domain>/confirm` and `https://<your-domain>/reset-password` (an address not listed sends the email's link to the Site URL instead).
   - **Authentication → Emails → Reset Password**: subject `Reset your Chronovault password`, body the content of `supabase/templates/recovery.html`. Its link opens `/reset-password` straight away, so it works on any device; Supabase's default one works only in the browser that asked for it. Local Supabase reads the same file from `config.toml`; the project's dashboard is the only copy online, so change both together.
   - Supabase's built-in email sender delivers only to the project team's addresses, a few per hour: enough for the owner of a personal deployment ("Forgot password?" for their own account). Anyone else needs a custom SMTP server (Authentication → Emails → SMTP Settings).
2. Add `https://<your-domain>` to the R2 CORS origins (if not done yet) and run `pnpm r2:check https://<your-domain>`.
3. **Personal use:** create your account from the Supabase dashboard (Authentication → Users → Add user, *Auto Confirm User*), then turn off **Allow new users to sign up** (Authentication → Sign In / Providers). Nobody else can then create an account; shared links keep working without one.
4. Upload a track online and open it in a private window via its share link.

## 13.5 Updating production

- **Code only:** commit and push to `main`; Vercel deploys.
- **With a new migration:** `make db-push` first (so the new code finds the new schema), then commit and push. Vercel never touches the database.
- Writing a migration: `make db-migration name=<description>` → write the SQL → `make db-migrate` → `make db-test` → `make db-types`.
- **Once, for FLACs uploaded before the seek tables** (2026-11-06, [7.4](07-data-flows.md#74-lossless-wav--flac-conversion)), after the deploy that brings them: `pnpm flac:seektable --env .env.r2` (`make flac-seektable env=.env.r2`) to see what it would do (`.env.r2` as for `pnpm r2:check`, 13.2), then the same with `--apply` (`apply=1`). It works on R2 only, never the database: it lists the bucket's `.flac` files and rewrites each with its table under the same key (the audio itself unchanged, checked byte for byte, the new size checked in R2). The tracks' `size_bytes` keep their old value, a few hundred bytes short: it is only shown, rounded, in the editor. A second run finds nothing to do.
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

## 13.8 The GitHub repository

The repository is **public**: the code, every commit and its author's email can be read by anyone. Nothing secret is in it (keys live in `.env*`, git-ignored, and in Vercel's settings), and the settings below keep it that way.

- **Commit identity:** commits carry the GitHub *noreply* address (`<id>+<user>@users.noreply.github.com`), set per clone ([0.3](00-setup.md#03-getting-the-code)). A commit with another address is public as soon as it is pushed, and Vercel refuses to deploy it ([16](16-troubleshooting.md#16-troubleshooting)).
- **`main` is protected by a ruleset** (*Settings → Rules → Rulesets*, target the default branch, *Active*): **Restrict deletions** and **Block force pushes**. Nothing else: branches are merged locally and `main` is pushed by `pnpm merge:main` ([14.1](14-conventions.md#141-git-workflow)), so rules requiring a pull request or passing checks before a push would refuse it. CI runs on the branch before the merge instead.
- **Secret scanning and push protection** (*Settings → Advanced Security*, free on public repositories): GitHub refuses a push that contains a known kind of key (Supabase, Cloudflare, Vercel tokens…), and alerts on any already in the history.
- **Dependabot** opens one grouped pull request a week for the GitHub Actions of the workflows ([11.6](11-local-development.md#116-updating-dependencies)); CI checks it, and it is merged from GitHub. If `main` moved on meanwhile, a comment `@dependabot rebase` on the pull request brings it up to date.
- **Vercel's Git fork protection** stays on (Vercel → the project → *Settings → Git*): a pull request from someone else's fork is not built with the project's environment variables until you approve it.

---

← [12. Testing](12-testing.md) · [Contents](../README.md#documentation) · [14. Development conventions](14-conventions.md) →
