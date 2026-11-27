# Backlog

Work that is known and waiting: bugs, interface fixes, features, backend and data changes, tooling, docs. One entry per point, each small enough to be picked up and finished on its own, with what is wrong (or missing), where, the options and the one recommended.

This page is not a numbered section of the docs: it changes all the time, and it empties as work gets done. Known limitations and large directions (a TV page, richer casting…) stay in [15](15-limitations-and-next-steps.md); a direction becomes entries here once it is cut into pieces that can be done one at a time.

## How this page works

- **One point, one branch.** A point is taken up on its own branch from `main` ([14.1](14-conventions.md#141-git-workflow)), named after its kind (`fix/…`, `feat/…`, `chore/…`, `docs/…`); several small points may share one.
- **Done means deleted.** The branch that does a point removes its entry from this page, in the same commit as the change. What the change did is told by the commit and by the section it touched (features, data flows…), not here.
- **IDs are never reused.** Each entry has an area prefix and a number (`UI-5`, `BE-2`), kept for good: "UI-5" means the same thing in a branch name, a commit or a chat. Gaps in the numbering are points already done. Each area counts on its own; the next number is one above the highest ever used in that area (`git log -S "UI-" -- docs/backlog.md` finds deleted ones).
- **Areas** appear when they get their first entry and go when they empty:

  | Prefix | Area |
  |---|---|
  | `UI` | Interface: layout, interaction, accessibility, on desktop and phones |
  | `FEAT` | New features, or changes to what an existing one does |
  | `BE` | Server: API routes, services, storage, performance |
  | `DATA` | Database: schema, migrations, security rules |
  | `OPS` | Tooling, CI, deployment, local stack, dependencies |
  | `DOCS` | Documentation |

  A point that touches several areas goes where most of the work is.
- **Priority** is high (broken, or in the way of using the app), medium (worse than it should be) or low (polish). Within an area entries are in the order they were added, not by priority.
- **An empty page is the goal.** When the last entry goes, each area says "Nothing pending." and the page stays as the place for the next ones.

### Template

```markdown
### UI-n Short statement of the problem

**Priority:** high | medium | low · **Kind:** e.g. layout bug, phones, missing feature · **Found:** YYYY-MM-DD

**What is wrong.** What happens, where it shows, how to see it (sizes, steps, data), and why it matters.

**Where.** Files and parts of them ([Name.vue](../app/…)).

**Options.**
- A) …
- B) …

**Recommended.** Which option, why, and how to check it is done.
```

## Features (FEAT)

### FEAT-3 Signing in takes a password: no "Continue with Google"

**Priority:** low · **Kind:** sign-in, missing feature · **Found:** 2026-11-24

**What is wrong.** The only way in is an email and a password ([login.vue](../app/pages/login.vue): `signInWithPassword`, `signUp`): one more password to keep for the owner and for anyone given an account. Locally this costs nothing (sign up at `localhost:3100`, no confirmation email), so the point is production.

**Where.** [login.vue](../app/pages/login.vue) (the button, `signInWithOAuth` with `redirectTo` back to the page asked for, as `useSignedInRedirect` does after a password sign-in); `[auth.external.google]` in [config.toml](../supabase/config.toml), its client id and secret from the environment so the local stack still starts without them; the Google provider in the production project's Supabase dashboard and an OAuth client in Google Cloud (its redirect URI is Supabase's `/auth/v1/callback`); [7.1](07-data-flows.md#71-authentication-and-route-protection), [13-deployment.md](13-deployment.md) for the setup, [01-features.md](01-features.md).

**Options.**
- A) Google through Supabase Auth: one button, Supabase handles the exchange and the session as for a password. An account already made with a password and the same (confirmed) email gets Google as a second identity rather than a second account.
- B) A sign-in link by email (magic link, `signInWithOtp`): no password and no Google Cloud set-up, but every sign-in waits for an email, and production then needs an SMTP service that delivers reliably (the default one has a low hourly limit).

**Recommended.** A). The button shows only where the provider is set (a runtime setting), so a local stack or a fork without Google credentials keeps the plain form. Sign-ups stay closed ([13.4](13-deployment.md#134-after-the-first-deploy)): the setting covers every provider, so Google only signs in accounts that already exist, and the OAuth consent screen stays in *Testing* with the owner alone as test user, so Google itself turns other accounts away first. Done when, in production, "Continue with Google" signs in and lands on the page that was asked for; signing in with Google as the owner of an existing password account opens that same library; another Google account is refused; and the local stack starts and the e2e tests pass with no Google credentials at all.

## Database (DATA)

### DATA-1 Plays are kept forever, though the statistics read 30 days

**Priority:** low, until the size check fails · **Kind:** data growth · **Found:** 2026-11-26

**What is wrong.** Every play is a row of `plays`, kept for good. The statistics read the last 7 or 30 days ([plays.service.ts](../server/services/plays.service.ts)); only a group of versions reads all of its plays, for its whole story ([feedback.service.ts](../server/services/feedback.service.ts), `listPlaylistPlayRows`). Visitors' plays are capped at 100 different listeners per track and day ([8.5](08-data-model-and-security.md#85-security-guarantees)), which bounds abuse but not ordinary growth: the table only gets bigger, toward the Free plan's 500 MB database, past which every write of the app fails. The weekly *Database size* workflow fails, and GitHub emails, once `plays` passes 100 MiB ([13.9](13-deployment.md#139-watching-the-databases-size)): that is when this entry is picked up.

**Where.** A migration: a function that deletes or rolls up old rows, run on a schedule; `listPlaylistPlayRows` and whatever reads a group's history; pgTAP tests; [7.16](07-data-flows.md#716-statistics), [8.1](08-data-model-and-security.md#81-entities).

**Options.**
- A) A daily job in the database (`pg_cron`, which Supabase offers on every plan) that deletes plays older than, say, 90 days, except those of groups of versions, whose story is read whole. The server never holds the service key, so the job has to live in Postgres, not behind a route.
- B) The same, but old rows are first added up into a small daily table (track, playlist, kind of listener, day, plays, completed) that a group's history reads alongside the recent rows: nothing is lost, at the cost of a second read path.

**Recommended.** A): nothing the app shows changes, and B)'s second read path is not worth it until someone wants all-time totals. Done when a pgTAP test shows the job deleting a visitor's 91-day-old play of a plain playlist and keeping a recent one and an old one of a group, the job is listed by `select * from cron.job`, and the next *Database size* run passes.

## Tooling (OPS)

### OPS-4 Production cannot be emptied in one go (database, covers, R2)

**Priority:** low · **Kind:** deployment, storage · **Found:** 2026-11-22

**What is wrong.** Starting production over (after test uploads, or before opening it to other people) means three separate manual steps: the database on Supabase, the `covers` bucket in Supabase Storage, and the `chronovault-audio` bucket on R2, whose dashboard deletes objects page by page. Forgetting one leaves tracks without files, or files without tracks: on R2 these are paid for per GB and can never be reached again.

**Where.** A new script in [scripts/](../scripts/), reusing the `aws4fetch` client and the `.env.r2` credentials of [check-r2.mjs](../scripts/check-r2.mjs); a target in the [Makefile](../Makefile) and a script in [package.json](../package.json); a new subsection in [13-deployment.md](13-deployment.md), and [03-commands.md](03-commands.md).

**Options.**
- A) One command (`pnpm prod:reset`, `make prod-reset`) that shows the linked project ref, the number of users and tracks and the number of objects in `covers` and on R2, asks the user to type the project ref, then: empties `covers` (`supabase storage rm -r ss:///covers --linked --experimental`, so no service key enters the repository); resets the database (`supabase db reset --linked --no-seed`: the demo user, whose password is public, must never exist in production); empties the R2 bucket (list and delete, 1,000 objects at a time). `covers` goes first because Storage lists files through their rows, which the database reset may remove; R2 is listed directly and does not depend on them. Each step can be run again if one fails half way.
- B) A checklist of the three manual steps in 13-deployment. Nothing to maintain, but nothing makes sure they are all done, and emptying a large R2 bucket by hand is slow.

**Recommended.** A). It refuses to run when `CI` is set or `.env.r2` is missing, and no other target calls it. Before writing it, check on a throwaway Supabase project and R2 bucket, never on production, what `supabase db reset --linked` does to `auth.users` and `storage.objects`, and that the `.env.r2` token (*Object Read & Write*) can list and delete. Done when, on that throwaway pair with a few uploads, the command leaves no users, no tracks and no objects in either bucket, `supabase migration list --linked` shows every migration applied, and a new account can sign up and upload.

### OPS-8 The sync editor's e2e test fails about once in a hundred runs, with the page frozen

**Priority:** low · **Kind:** e2e test, possibly performance · **Found:** 2026-11-26

**What is wrong.** "a line stamped while a save is on its way is kept, and still unsaved" ([unsaved-changes.spec.ts](../test/e2e/unsaved-changes.spec.ts)) failed once in 100 runs of the file (`--repeat-each 20 --workers 4`, a laptop also running the local stack): "Changes saved" did not show within 15 s of the held save being released. The trace says the save is not the cause: the PATCH answered `200` some 70 ms after the release. What stalls is the page: for about 14 s its frames do not change, with the Sync tab at "Loading the detailed waveform… 65%" and the player at 0:00 although it is playing; then everything moves again, the toast included. Something kept the page's main thread busy, or the frames stopped updating while the waveform was loading. CI retries a failed test once, so it would rarely show there; a real stall of that length would also be felt by a person syncing lyrics on a slow device.

**Where.** [LyricsSyncTimeline.vue](../app/components/lyrics/LyricsSyncTimeline.vue) (wavesurfer fetches and decodes the whole file for the detailed waveform, `normalize: true`, on the player's own `<audio>`); the test, which plays a 60-second WAV while the timeline loads.

**Options.**
- A) Reproduce it with `pnpm test:e2e test/e2e/unsaved-changes.spec.ts -g "stamped" --repeat-each 50 --workers 4` and a performance trace of the page (Chrome DevTools Protocol `Tracing`, or Playwright's `page.context().tracing` with screenshots) to see what runs during the freeze: wavesurfer's decoding and normalising, the regions' rendering, or plain CPU starvation of a loaded machine.
- B) Make the test independent of it: wait for the timeline to be ready (the waveform drawn) before stamping and saving. Cheap, but it hides a stall a person could meet, if it is one.

**Recommended.** A) first: if the freeze is the app's own work on the main thread, move it off (wavesurfer accepts precomputed peaks, and the app already keeps 1000 per track, though the sync timeline wants more detail); if it is only an overloaded machine, B). Done when 100 runs of the test pass with 4 workers.
