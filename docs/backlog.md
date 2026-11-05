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

The first entries come from a review of 2026-11-04, made by driving the app with Playwright on the local stack, with a library of 24 tracks, 5 playlists and a group of versions with votes, at these sizes: desktop 1440×900 and 1280×720, tablet 820×1180 (touch), phone 390×844 and 375×667 (touch); dark theme (the default) and light theme; share pages as a visitor who is not signed in. Widths are CSS pixels; "phones" means below `sm` (640px), as in `main.css`.

### UI-16 Leaving with unsaved changes asks through the browser's own box

**Priority:** low · **Kind:** polish · **Found:** 2026-11-04

**What is wrong.** Leaving an editor with unsaved changes for another page of the app asks "You have unsaved changes. Leave anyway?" through `window.confirm`: the browser's grey box, unlike every other question in the app, with only OK and Cancel. (Reloading or closing the tab must keep the browser's question: `beforeunload` cannot show anything else.)

**Where.** [useEditForm.ts](../app/composables/useEditForm.ts), `onBeforeRouteLeave`; the upload page asks the same way ([pages/tracks/new.vue](../app/pages/tracks/new.vue)).

**Options.**
- A) The app's own dialog (like `ConfirmDialog`) with three answers: Save and leave, Leave without saving, Stay.
- B) The app's dialog with the same two answers as today.

**Recommended.** A in the editors (Save and leave saves first and leaves only when the save went through); B on the upload page, where uploads in progress can only be waited for or left.

### UI-20 Playlists without covers all look the same

**Priority:** low · **Kind:** polish · **Found:** 2026-11-04

**What is wrong.** A playlist without a cover of its own shows the covers of its first tracks; when those have none either, it shows the Chronovault artwork, so a grid of such playlists is the same image repeated, told apart only by the titles underneath.

**Where.** [PlaylistCover.vue](../app/components/playlist/PlaylistCover.vue), the fallback branch.

**Options.**
- A) The artwork with the playlist's initials or a short title over it.
- B) The artwork tinted with a colour derived from the playlist's id.

**Recommended.** A: readable even in small sizes. Low priority while most tracks have covers of their own.

### UI-21 Selection mode needs the Select button on phones

**Priority:** low · **Kind:** phones · **Found:** 2026-11-05

**What is wrong.** On phones, ticking several tracks starts from "Select" at the top of the library; photo galleries and file managers also start it with a long press on an item, which phone users try first. "Done" is up there too, out of reach once the list is scrolled (the selection bar itself is at the bottom of the screen).

**Where.** [TrackList.vue](../app/components/track/TrackList.vue) (rows), [pages/index.vue](../app/pages/index.vue) (selection mode and its bar).

**Options.**
- A) A long press on a row turns selection mode on with that track ticked, with a short vibration as on Android; a ✕ in the selection bar ends it.
- B) Only the ✕ in the selection bar.

**Recommended.** A. The long press must not fight the page's scrolling or the row's tap (play), and must not open the browser's own menu on the cover image.

---

[Contents](../README.md#documentation)
