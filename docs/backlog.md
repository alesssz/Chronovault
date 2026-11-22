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

## Interface (UI)

### UI-42 The versions of a song look the same in narrow lists

**Priority:** medium · **Kind:** phones, versions · **Found:** 2026-11-20

**What is wrong.** Versions differ only at the end of their title ("The Silver Mask of Hierusalem 1" and "… 2", "The Marble and the Flames" and "… (Cover)"), and the end is what a cut title loses. At 375px the library shows "The Silver Mask of Hier…" twice, and so does the group's "Add versions" dialog, the one place where versions are picked one by one. The player bar on every screen (on desktop too: its title column is about 200px), the full-screen player on phones ("The Silver Mask of Hierus…", under a cover with room to spare), and the statistics' "Shared pages" list on phones cut them the same way.

**Where.** The title in [TrackList.vue](../app/components/track/TrackList.vue) (the row), [PlaylistAddTracksDialog.vue](../app/components/playlist/PlaylistAddTracksDialog.vue), [PlayerBar.vue](../app/components/player/PlayerBar.vue), the phone title of [PlayerExpanded.vue](../app/components/player/PlayerExpanded.vue), the "Shared pages" list in [stats.vue](../app/pages/stats.vue).

**Options.**
- A) Titles on two lines (`line-clamp-2`): most fit whole, but rows get uneven heights, and a long title still loses its end on the second line.
- B) Keep the end in sight: the title in two pieces, everything but its last word (which truncates) and the last word (which never does), so a narrow line reads "The Silver Mask of Hi… 2" and "The Marble and the… (Cover)". Rows keep one line.

**Recommended.** B), in one small component used by the five places. Done when, at 375px, the library, the "Add versions" dialog and both players tell every pair of versions of the demo account apart, and a title that fits is shown whole; an e2e check on a phone viewport that the last word of a cut title is visible.

### UI-48 Dropping files to upload shows nothing where the user is looking

**Priority:** medium · **Kind:** feedback, uploads · **Found:** 2026-11-21

**What is wrong.** On the upload page, dropped or chosen files go straight into the queue, but the queue ("Uploads · 0/3", one row per file) is drawn at the bottom of the page, after the drop zone, the note on tags and the FLAC notice. The drop zone looks the same as before and no toast appears, so nothing seems to happen until the user scrolls down. Files refused at once (too large, or not audio), failed uploads and the final "Go to library" button are out of sight too. A user who thinks the drop did not work may drop the same files again, and each drop becomes a new track.

**Where.** [new.vue](../app/pages/tracks/new.vue), where the "Uploads" section comes after the notes; the queue itself is in [useTrackUploader.ts](../app/composables/useTrackUploader.ts).

**Options.**
- A) Scroll down to the "Uploads" section when files are added. The list is seen, but the page jumps away from the drop zone on every drop.
- B) Move the "Uploads" section right under the drop zone, with the tags note and the FLAC notice after it. The rows appear where the files were dropped.
- C) Show a toast when files are added ("3 files added") and when the queue ends ("3 uploaded, 1 failed"). The user knows something happened, but still has to scroll to see the progress and the errors.

**Recommended.** B), since the list belongs with the drop zone and A and C are then not needed. Done when the first row of the queue is in view right after a drop, without scrolling, at 1280×720 and at 375px. An e2e check makes sure the first `upload-item` is in the viewport after choosing files.

## Tooling (OPS)

### OPS-3 Resetting the local data leaves the audio and covers behind

**Priority:** medium · **Kind:** local stack, storage · **Found:** 2026-11-22

**What is wrong.** `pnpm db:reset` (`make db-reset`) rebuilds the database from the migrations and the seed, but the files uploaded to the local Storage stay in the `supabase_storage_chronovault` volume with nothing pointing to them: the `audio` bucket, which stands in for R2 locally, and `covers`. On 2026-11-22 the volume held about 39,700 audio files (2 GB) against 21 rows in `storage.objects`. They take disk space and survive every reset, so starting from scratch never does for the files. Production needs the same operation (OPS-4).

**Where.** The `db-reset` target in the [Makefile](../Makefile) and the `db:reset` script in [package.json](../package.json); [stack.mjs](../scripts/stack.mjs), which already starts and stops the stack; [03-commands.md](03-commands.md) and [11-local-development.md](11-local-development.md), which describe the reset.

**Options.**
- A) Empty both buckets through the local Storage (its S3 endpoint, with the keys `pnpm env:local` writes to `.env`), then `supabase db reset`. Storage lists only the files that have a row, so the 39,700 orphans already there stay.
- B) `supabase stop --no-backup`, then `supabase start`: the stack's Docker volumes (database and storage) are deleted and recreated from the migrations and the seed. Everything goes, orphans included; it takes as long as a stack restart.
- C) A), plus deleting the bucket folders inside the storage container (`docker exec … rm -rf`). Tied to the container's internal layout, which can change with any Supabase version.

**Recommended.** B), behind the existing names (`pnpm db:reset`, `make db-reset`), asking for confirmation first as Flowboard's `db-reset` does, since it deletes every local account, track and file. Done when, after `make db-reset`, the storage volume has no files left (`docker exec supabase_storage_chronovault find /mnt -type f | wc -l` prints 0), the existing `.env` still works (the local keys come from `config.toml`), the demo user signs in, and `pnpm test:e2e` passes on the fresh stack.

### OPS-4 Production cannot be emptied in one go (database, covers, R2)

**Priority:** low · **Kind:** deployment, storage · **Found:** 2026-11-22

**What is wrong.** Starting production over (after test uploads, or before opening it to other people) means three separate manual steps: the database on Supabase, the `covers` bucket in Supabase Storage, and the `chronovault-audio` bucket on R2, whose dashboard deletes objects page by page. Forgetting one leaves tracks without files, or files without tracks: on R2 these are paid for per GB and can never be reached again.

**Where.** A new script in [scripts/](../scripts/), reusing the `aws4fetch` client and the `.env.r2` credentials of [check-r2.mjs](../scripts/check-r2.mjs); a target in the [Makefile](../Makefile) and a script in [package.json](../package.json); a new subsection in [13-deployment.md](13-deployment.md), and [03-commands.md](03-commands.md).

**Options.**
- A) One command (`pnpm prod:reset`, `make prod-reset`) that shows the linked project ref, the number of users and tracks and the number of objects in `covers` and on R2, asks the user to type the project ref, then: empties `covers` (`supabase storage rm -r ss:///covers --linked --experimental`, so no service key enters the repository); resets the database (`supabase db reset --linked --no-seed`: the demo user, whose password is public, must never exist in production); empties the R2 bucket (list and delete, 1,000 objects at a time). `covers` goes first because Storage lists files through their rows, which the database reset may remove; R2 is listed directly and does not depend on them. Each step can be run again if one fails half way.
- B) A checklist of the three manual steps in 13-deployment. Nothing to maintain, but nothing makes sure they are all done, and emptying a large R2 bucket by hand is slow.

**Recommended.** A). It refuses to run when `CI` is set or `.env.r2` is missing, and no other target calls it. Before writing it, check on a throwaway Supabase project and R2 bucket, never on production, what `supabase db reset --linked` does to `auth.users` and `storage.objects`, and that the `.env.r2` token (*Object Read & Write*) can list and delete. Done when, on that throwaway pair with a few uploads, the command leaves no users, no tracks and no objects in either bucket, `supabase migration list --linked` shows every migration applied, and a new account can sign up and upload.

### OPS-5 Chronovault, Flowboard and AtleoPlan use different `make` names for the same actions

**Priority:** low · **Kind:** tooling, across projects · **Found:** 2026-11-22

**What is wrong.** The three projects each have a Makefile with `make help`, and `help`, `setup`, `install`, `check`, `lint`, `typecheck`, `audit`, `github-check` and `merge` (with `yes=1` and `checks=0`) already mean the same thing in all of them. The rest differ, so what works in one project fails in the next:

| Action | Chronovault | Flowboard | AtleoPlan |
|---|---|---|---|
| Start everything to develop | `local` | `db-up`, then `dev` | `start` |
| Stop, keeping the data | `stop` | `db-down` | `down` |
| Print the local addresses | `db-status` (with the keys) | `urls` | `urls` |
| Check the computer | `doctor` | none | `doctor` |
| What is running | `db-status` | none | `ps` |
| Follow the logs | `docker-logs` | none | `logs` |
| Apply the migrations | `db-migrate` | `db-migrate` | `migrate` |
| Empty and rebuild the dev database | `db-reset` (no question) | `db-reset` (asks) | `fresh` |
| Automatic fixes | `lint-fix` | none | `fix`, `lint-fix` |
| New branch, update main, push | none | `branch`, `sync`, `push` | `branch`, `sync`, `push` |
| Remove the builds | `clean`, `clean-all` | `clean`, `clean-all` | none |

**Where.** The [Makefile](../Makefile) of each repository (`../Flowboard/Makefile` and `../AtleoPlan/Makefile` sit next to this one) and the pages that list the commands: here [03-commands.md](03-commands.md), the [README](../README.md) and [CLAUDE.md](../CLAUDE.md); their equivalents in the other two.

**Options.**
- A) A shared list of names and meanings, the same table on each repository's commands page. Each Makefile renames its targets to match and keeps the ones only it has (Chronovault `docker`, `db-types`, `db-advisors`; Flowboard `dev-web`, `dev-api`; AtleoPlan `artisan`, `exercises-*`, `phone`). The repositories are separate, so the list is copied, not shared.
- B) A `common.mk` with the targets that are truly identical (`help`, `branch`, `sync`, `push`, `merge`, `audit`, `github-check`), included by each Makefile and copied between the repositories or kept in a git submodule. Fewer copies to keep in step, but start, stop and the database differ per project anyway, and a submodule adds a step to every clone.

**Recommended.** A), with this common core, each doing the project's own thing: `help`, `doctor`, `setup`, `install`, `urls`, `start` (everything needed to develop), `stop` (keeps the data), `status`, `logs`, `db-migrate`, `db-reset` (asks first; for Chronovault see OPS-3), `lint`, `lint-fix`, `fix`, `typecheck`, `test`, `check`, `audit`, `github-check`, `branch`, `sync`, `push`, `merge`, `clean`, `clean-all`. Old names are removed rather than kept as aliases, so `make help` stays short. One `chore/` branch per repository. Done when every core name works in all three, `make help` lists them under the same groups and in the same order, and no doc of the three still names a removed target.
