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

### UI-17 Save looks the same with or without changes

**Priority:** low · **Kind:** polish · **Found:** 2026-11-04

**What is wrong.** With nothing to save, the Save button of the track editor's header (from `md`, 768px) and of a playlist's "Edit details" dialog is disabled, which Nuxt UI shows as the same gold button at 75% opacity: on a dark background it is hard to tell whether there is something to save.

**Where.** The Save buttons of [pages/tracks/[id]/edit.vue](../app/pages/tracks/[id]/edit.vue) and [PlaylistDetailsDialog.vue](../app/components/playlist/PlaylistDetailsDialog.vue).

**Options.**
- A) Neutral and subtle while there is nothing to save, gold (primary) once something changed.
- B) Keep the colour, change the label: "Saved" with a check while clean, "Save" when dirty.

**Recommended.** A. Below `md` the header has no Save: the Save bar at the bottom of the screen (SaveBar) appears only when there is something to save.

### UI-18 The demo-data notice is hard to read in the light theme

**Priority:** low · **Kind:** polish · **Found:** 2026-11-04

**What is wrong.** On the statistics page the "Demo data" notice is a subtle warning alert: in the light theme its text is yellow on pale yellow, below the contrast the rest of the app keeps (main.css raises primary and secondary to 700 in the light theme for the same reason). It shows only locally, but the same alert colour may be used elsewhere.

**Where.** [pages/stats.vue](../app/pages/stats.vue) (`UAlert color="warning" variant="subtle"`); the warning colour in [main.css](../app/assets/css/main.css).

**Options.**
- A) Raise the light theme's warning step (`--ui-warning`) as main.css already does for primary and secondary.
- B) The neutral colour with the warning icon for this notice only.

**Recommended.** A: it fixes every warning alert and badge at once ("Draft", the private-tracks notice).

### UI-19 The "Mastering" filter reads as a label

**Priority:** low · **Kind:** polish · **Found:** 2026-11-04

**What is wrong.** The library's filters show "All genres", "All versions" and "Most recent" when nothing is chosen, but the mastering one shows "Mastering", which reads as the name of the field rather than a choice.

**Where.** [pages/index.vue](../app/pages/index.vue), `masteredOptions`.

**Options.** "Any mastering", or "Mastered or not".

**Recommended.** "Any mastering".

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

### UI-22 A comment between root `v-if` branches drops a component's classes on server-rendered pages

**Priority:** low · **Kind:** robustness · **Found:** 2026-11-05

**What is wrong.** When a component's root is a `v-if` / `v-else` chain with an HTML comment before a branch, Vue's server renderer sees several root nodes and does not pass on the classes the page gives the component; hydration reports a class mismatch and does not restore them. A playlist's share page lost its cover's sizes this way (fixed in PlaylistCover). [PlayerVolume.vue](../app/components/player/PlayerVolume.vue) has the same shape; today it is only given classes in client-rendered places (the player bar, the full-screen view), so nothing shows, but a share page giving it a class would hit it.

**Where.** [PlayerVolume.vue](../app/components/player/PlayerVolume.vue), the comments before its two root branches; any component written the same way later.

**Options.**
- A) Move PlayerVolume's comments inside its branches, as PlaylistCover now does.
- B) A) plus a check that finds the shape (a lint rule, or a small script in `pnpm check`).

**Recommended.** A now; B if the shape comes back.

## Features (FEAT)

### FEAT-1 No way to reset a forgotten password

**Priority:** medium · **Kind:** sign-in · **Found:** 2026-11-04

**What is wrong.** The sign-in page has email and password and the switch to sign-up, but nothing for a forgotten password: whoever forgets it is locked out (locally the demo account can be reset with the database; in production only from the Supabase dashboard).

**Where.** [pages/login.vue](../app/pages/login.vue).

**Options.**
- A) "Forgot password?" sending Supabase's reset email (`resetPasswordForEmail`), and a page to choose the new password when coming back from the link.
- B) Sign-in by emailed link (magic link) next to the password.

**Recommended.** A. It needs the redirect address allowed in Supabase Auth (local `config.toml` and the Supabase project, [13](13-deployment.md)) and an e2e test through the local mail catcher (Mailpit, [11](11-local-development.md)).

---

[Contents](../README.md#documentation)
