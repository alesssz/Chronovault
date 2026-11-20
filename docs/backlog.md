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

**What is wrong.** Versions differ only at the end of their title ("The Silver Mask of Hierusalem 1" and "… 2", "The Marble and the Flames" and "… (Cover)"), and the end is what a cut title loses. At 375px the library shows "The Silver Mask of Hier…" twice, and so does the group's "Add versions" dialog, the one place where versions are picked one by one. The player bar on every screen (on desktop too: its title column is about 200px), and the statistics' "Shared pages" list on phones, cut them the same way.

**Where.** The title in [TrackList.vue](../app/components/track/TrackList.vue) (the row), [PlaylistAddTracksDialog.vue](../app/components/playlist/PlaylistAddTracksDialog.vue), [PlayerBar.vue](../app/components/player/PlayerBar.vue), the "Shared pages" list in [stats.vue](../app/pages/stats.vue).

**Options.**
- A) Titles on two lines (`line-clamp-2`): most fit whole, but rows get uneven heights, and a long title still loses its end on the second line.
- B) Keep the end in sight: the title in two pieces, everything but its last word (which truncates) and the last word (which never does), so a narrow line reads "The Silver Mask of Hi… 2" and "The Marble and the… (Cover)". Rows keep one line.

**Recommended.** B), in one small component used by the four places. Done when, at 375px, the library and the "Add versions" dialog tell every pair of versions of the demo account apart, and a title that fits is shown whole; an e2e check on a phone viewport that the last word of a cut title is visible.

### UI-43 Long titles cut on phones where there is room for two lines

**Priority:** low · **Kind:** phones · **Found:** 2026-11-20

**What is wrong.** At 375px a group's page is titled "The Silver Ma…" (the title shares its line with the Play and Edit buttons), the Versions page's cards read "The Marble and…" and "The Pyre of the …", and the full-screen player cuts "The Silver Mask of Hierus…" under a cover with plenty of space. These are the places that name what is open, and a page title that cannot be read leaves only the cover to go by.

**Where.** The heading of [PlaylistEditor.vue](../app/components/playlist/PlaylistEditor.vue) (playlists and groups), the card title in [PlaylistGrid.vue](../app/components/playlist/PlaylistGrid.vue), the phone title of [PlayerExpanded.vue](../app/components/player/PlayerExpanded.vue).

**Options.**
- A) The heading wraps instead of truncating, its buttons aligned to its first line; the cards and the full-screen player take up to two lines (`line-clamp-2`).
- B) On phones, the heading's buttons on a row of their own under the title, which then has the whole width (still two lines for the longer titles).

**Recommended.** A): the buttons stay where they are on every page, and a title rarely needs more than two lines (three for "The Silver Mask of Hierusalem – versions" beside the buttons, at 375px). Done when the three places show the demo account's titles whole at 375px.

### UI-44 The library's search box is narrow on 1280px screens

**Priority:** low · **Kind:** layout · **Found:** 2026-11-20

**What is wrong.** From `xl` (1280px) the search box and the five filters share one row; the filters have fixed widths, so at 1280px the search box gets about 170px and its placeholder reads "Search title, c". A typical laptop screen sits right at this width.

**Where.** The toolbar of [index.vue](../app/pages/index.vue) (the `xl:` classes) and [LibraryFilters.vue](../app/components/LibraryFilters.vue).

**Options.**
- A) One row only from `2xl` (1536px): below it the search box keeps its own row, the filters five across under it, as already from `lg`.
- B) Narrower filters at `xl`, which cuts their own labels ("Any mastering", "All subgenres").

**Recommended.** A), a change of breakpoint only. Done when the placeholder shows whole at 1280px and at 1536px.

### UI-45 "Replace audio" is smaller than the buttons around it

**Priority:** low · **Kind:** consistency · **Found:** 2026-11-20

**What is wrong.** In the track editor's side column "Add cover", "Copy share link" and "Delete track" are full-width buttons of the default size; "Replace audio", between them, is `size="sm"`, with smaller text and height, and looks like a different kind of control.

**Where.** [TrackEditSidebar.vue](../app/components/track/TrackEditSidebar.vue).

**Options.**
- A) The default size, like the others.
- B) Keep it small on purpose, as a rarer action: then it should look like a link rather than a smaller button.

**Recommended.** A): the column already orders its actions by section, and the same format everywhere is the rule. Done when the four buttons are the same height on phone and desktop.

### UI-46 A shared group says "versions" three times at its top

**Priority:** low · **Kind:** wording · **Found:** 2026-11-20

**What is wrong.** A group's share page reads "The Silver Mask of Hierusalem – versions", then "Versions · 2 versions · 10:41" under it. The leading "Versions" mirrors the playlists' "Playlist · 12 tracks", but a group's title and count already say what it is. The same summary is the link preview's text when the group has no description.

**Where.** `summary` in [p/[id].vue](../app/pages/p/%5Bid%5D.vue); the check in [versions.spec.ts](../test/e2e/versions.spec.ts) (`/^Versions · 2 versions/`).

**Options.**
- A) "2 versions · 10:41" for a group, "Playlist · 12 tracks · 48:10" unchanged.
- B) "2 versions to choose from · 10:41", which also says what the page is for (though the hint under it already does).

**Recommended.** A). Done when the summary and the preview text read "2 versions · 10:41", with the e2e check updated.

### UI-47 The statistics list every shared page, at any length

**Priority:** low · **Kind:** phones, statistics · **Found:** 2026-11-20

**What is wrong.** "Shared pages" lists every shared track and playlist: 25 for the demo account, about four phone screens of scrolling before the referrers, countries and devices under it, and more with every song shared.

**Where.** The "Shared pages" card in [stats.vue](../app/pages/stats.vue).

**Options.**
- A) The first 10 (they are sorted by views), and "Show all 25" under them.
- B) The same on phones only.

**Recommended.** A): ten rows are enough to see what is listened to on any screen. Done when the card shows 10 rows and the button, and the button shows the rest.
