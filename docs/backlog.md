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
