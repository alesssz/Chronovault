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
5. **Let CI apply the next migrations** (13.5). It needs only the database's address, password included:
   - The address: the project's **Connect** button → the connection string, URI format, method **Session pooler** (`postgresql://postgres.<project-ref>:[YOUR-PASSWORD]@aws-0-<region>.pooler.supabase.com:5432/postgres`), with the database password (set when the project was made; *Project Settings → Database → Reset database password* makes a new one, letters and digits only) in place of `[YOUR-PASSWORD]`. The Session pooler, because the direct connection is IPv6 only on the Free plan and GitHub's runners have no IPv6; not the Transaction pooler (port 6543), unfit for migrations.
   - Check it from a terminal, without it showing on screen or in the history:
     ```bash
     read -rs SUPABASE_DB_URL      # paste the address, Enter (nothing shows)
     echo ${#SUPABASE_DB_URL}      # its length, about 110: not 0
     pnpm exec supabase migration list --db-url "$SUPABASE_DB_URL"   # every migration Local = Remote
     unset SUPABASE_DB_URL
     ```
   - GitHub → *Settings → Environments → New environment* **`production`**: *Deployment branches and tags* → *Selected branches and tags* → rule `main` (only `main`'s runs can read it; no required reviewers, no wait timer). Add the **environment secret `SUPABASE_DB_URL`** with the address.

   No access token: without `supabase link`, `db push --db-url` needs nothing else, and a token able to link would also read the project's secret key. A new database password means updating the secret.

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
6. **Deployment Checks** (the project's *Settings → Build and Deployment → Deployment Checks* → *Add Checks* → provider GitHub): require **Migrate production database**, the CI job that applies the migrations (13.5). Vercel then builds each production deployment as soon as `main` changes but puts it online (on the production domains) only once that job passed on the same commit, so the new code never meets the old schema; until then the previous deployment stays live. No change to the workflow is needed: Vercel reads the job's result from GitHub by its name (rename the job, update the check). Production's *automatic aliasing* must stay on. In an emergency a deployment's page offers *Force Promote*.
7. The functions run in **London (`lhr1`)**, set in `nuxt.config.ts` (`nitro.vercel.functions.regions`), next to the Supabase project (eu-west-2): every API call reaches the database several times. A Supabase project in another region needs the nearest [Vercel region](https://vercel.com/docs/regions) there instead. Check it: the deployment's *Functions* tab shows the region.

## 13.4 After the first deploy

1. Supabase → **Authentication → URL Configuration**: *Site URL* `https://<your-domain>`, *Redirect URLs* `https://<your-domain>/confirm` and `https://<your-domain>/reset-password` (an address not listed sends the email's link to the Site URL instead).
   - **Authentication → Emails → Reset Password**: subject `Reset your Chronovault password`, body the content of `supabase/templates/recovery.html`. Its link opens `/reset-password` straight away, so it works on any device; Supabase's default one works only in the browser that asked for it. Local Supabase reads the same file from `config.toml`; the project's dashboard is the only copy online, so change both together.
   - Supabase's built-in email sender delivers only to the project team's addresses, a few per hour: enough for the owner of a personal deployment ("Forgot password?" for their own account). Anyone else needs a custom SMTP server (Authentication → Emails → SMTP Settings).
2. Add `https://<your-domain>` to the R2 CORS origins (if not done yet) and run `pnpm r2:check https://<your-domain>`.
3. **Personal use:** create your account from the Supabase dashboard (Authentication → Users → Add user, *Auto Confirm User*), then turn off **Allow new users to sign up** (Authentication → Sign In / Providers). Nobody else can then create an account; shared links keep working without one.
4. Upload a track online and open it in a private window via its share link.

## 13.5 Updating production

- **Code and migrations alike:** push the branch and run `pnpm merge:main`. Once CI passes, GitHub merges it into `main`, and then, in this order:
  1. CI runs again on `main` (the merged code: lint, types, unit, database and end-to-end tests);
  2. its **Migrate production database** job applies the migrations of `supabase/migrations` that production lacks (`supabase db push --db-url`, with the `production` environment's secret, 13.1), none most of the time; the seed is never applied;
  3. Vercel, which built the deployment at the merge, puts it online once that job passed (Deployment Checks, 13.3).

  About ten minutes from merge to live. Vercel never touches the database. A failed check or migration leaves the previous deployment live; after a failed migration, `migration list` shows which ones production has (16).
- **Migrations suit the code already live**, which keeps running against the new schema for those minutes: add first (a new column, table or function), switch the code over, and drop what the old code used in a later merge (*expand and contract*). A rename is an add, then a drop.
- **By hand** (`make db-link ref=<project-ref>` once, then `make db-push`) only to repair: the job would apply the same migrations at the next merge anyway, and `migration list` shows where production stands.
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

Nothing to set up: `vercel.json` declares a **Vercel Cron** job that calls `GET /api/keepalive` every day at 06:00 UTC (the Hobby plan allows daily jobs, run at some point within that hour). The route reads one genre as the anonymous role, which is real database activity; `/api/health` would not do, since it never reaches the database. The route needs no secret: anyone holding the public Supabase key can already read the built-in genres straight from Supabase.

- **Check it:** Vercel → the project → **Settings → Cron Jobs** lists the job, with *Run* to try it at once and a link to its logs. Cron jobs run on the production deployment only.
- **If Supabase pauses the project anyway** (an email warns about a week before, and another confirms the pause): Supabase dashboard → the project → *Restore*. Then check the Cron Jobs page: a failing job (500 in its logs) means the database was not reached.

## 13.8 The GitHub repository

The repository is **public**: the code, every commit and its author's email can be read by anyone. Nothing secret is in it (keys live in `.env*`, git-ignored, and in Vercel's settings), and the settings below keep it that way.

- **Commit identity:** commits carry the GitHub *noreply* address (`<id>+<user>@users.noreply.github.com`), set per clone ([0.3](00-setup.md#03-getting-the-code)). A commit with another address is public as soon as it is pushed, and Vercel refuses to deploy it ([16](16-troubleshooting.md#16-troubleshooting)). The merge commits GitHub makes itself (auto-merge) take the account's email for web operations instead: keep **Keep my email addresses private** on (github.com → *Settings → Emails*), so that it is the noreply one; the page then says "All web-based Git operations will be linked to …noreply…".
- **`main` is protected by a ruleset** (*Settings → Rules → Rulesets*, target the default branch, *Active*, no bypass list): **Restrict deletions**, **Block force pushes**, **Require a pull request before merging** (0 approvals: one person works here) and **Require status checks to pass**, with the two CI jobs: *Lint, types and unit tests* and *Database and end-to-end tests* (the Audit job is left out: it runs only when the dependencies change, and a required check that never runs would block every other pull request). Nothing reaches `main`, the production branch, without a green CI: not a push, not a merge. `pnpm merge:main` works within it ([14.1](14-conventions.md#141-git-workflow)).
- **Environment `production`** (*Settings → Environments*): the database's address as the secret `SUPABASE_DB_URL` (13.1), readable only by runs on `main`, through CI's migrate job. Nothing else of production lives on GitHub: the app's keys are in Vercel.
- **Pull request settings** (*Settings → General → Pull Requests*): **Allow merge commits** (`pnpm merge:main` merges with one, `--no-ff`), **Allow auto-merge** (GitHub merges a pull request by itself once the required checks pass) and **Automatically delete head branches**.
- **Secret scanning and push protection** (*Settings → Advanced Security*, free on public repositories): GitHub refuses a push that contains a known kind of key (Supabase, Cloudflare, Vercel tokens…), and alerts on any already in the history.
- **Dependabot** opens one grouped pull request a week for the GitHub Actions of the workflows and of `.github/actions/setup`, pinned to commit hashes ([11.6](11-local-development.md#116-updating-dependencies)); CI checks it, and it is merged from GitHub. If `main` moved on meanwhile, a comment `@dependabot rebase` on the pull request brings it up to date.
- **Vercel's Git fork protection** stays on (Vercel → the project → *Settings → Git*): a pull request from someone else's fork is not built with the project's environment variables until you approve it.

---

← [12. Testing](12-testing.md) · [Contents](../README.md#documentation) · [14. Development conventions](14-conventions.md) →
