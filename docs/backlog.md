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

The entries from UI-25 come from a review of 2026-11-06, made like the first one (2026-11-04) by driving a production build with Playwright on the local stack, with a library of 24 tracks, 6 playlists (one empty) and a group of versions with two votes, at desktop 1440×900 and 1280×720, tablet 820×1180 (touch), phone 390×844 and 375×667 (touch), in the dark and the light theme, signed in and as a visitor; no page scrolled sideways and no page raised an error. Widths are CSS pixels.

### UI-27 On tablets the editors' content column is too narrow: titles break mid-word

**Priority:** medium · **Kind:** tablet layout · **Found:** 2026-11-06

**What is wrong.** From `md` (768px) the track editor and the playlist and group pages put a 16rem column (cover, details, sharing) beside the content. At 820px the content column keeps about 400px: on a group's page the version titles wrap mid-word ("Teutob / urg (v…") beside the lock and Draft badge, so the three versions look alike; a playlist's tracks are cut ("Carthago Del…"); the Sync rows are cut ("Under the as…").

**Where.** [PlaylistEditor.vue](../app/components/playlist/PlaylistEditor.vue) and [pages/tracks/[id]/edit.vue](../app/pages/tracks/[id]/edit.vue) (`md:grid-cols-[16rem_1fr]`); the row of [PlaylistTrackRow.vue](../app/components/playlist/PlaylistTrackRow.vue).

**Options.**
- A) Two columns from `lg` (1024px); below it the cover as a small row above the content, as on phones.
- B) Keep `md`, with a narrower side column and the badges under the title.

**Recommended.** A: the content gets the whole width where it is short of it; check at 820px that no title breaks inside a word.

### UI-28 The selection bar is cramped on tablets

**Priority:** medium · **Kind:** tablet layout · **Found:** 2026-11-06

**What is wrong.** At 820px the selection bar uses the desktop row: the count is cut ("2 sel…") and the actions wrap over two lines ("Mark / final", "Share for / feedback").

**Where.** [pages/index.vue](../app/pages/index.vue), the selection bar and `SELECTION_ACTION`.

**Options.**
- A) The phone layout (icon over a short name, four columns) up to `lg`, the row from `lg`.
- B) The row with the short names ("Final", "Playlist", "Feedback") between `sm` and `lg`.

**Recommended.** B: the bar stays under the header as on desktop, with names that fit; the count never cut.

### UI-29 On phones a shared playlist's cover pushes its tracks and the vote below the first screen

**Priority:** medium · **Kind:** phones, share pages · **Found:** 2026-11-06

**What is wrong.** Below `sm` a playlist's share page (`/p/…`) starts with a cover as wide as the screen: at 390×844 the first track is at the bottom edge, and on a group of versions, whose point is choosing one, the hearts are out of sight; at 375×667 the list starts below the first screen. (From `sm` the cover is already a small square beside the title.)

**Where.** [pages/p/[id].vue](../app/pages/p/[id].vue), the header row.

**Options.**
- A) On phones too, a smaller cover beside the title (about a third of the width).
- B) Only for groups of versions.

**Recommended.** A: the track page (`/t/…`) keeps its large cover, the playlist's list is the content; check that the first rows are in the first screen at 375×667.

### UI-30 A visitor's vote page puts its instruction at the bottom and never says the pick is saved

**Priority:** medium · **Kind:** share pages · **Found:** 2026-11-06

**What is wrong.** On a group's share page, "Listen to the versions, then tap the heart next to your favourite" comes after the list, at the bottom edge of a desktop screen, while the group's own question ("Which one do you prefer?") sits under the title. After a heart is chosen the pick is stored at once, but the panel only says "Your pick: …" above a pale, disabled Save that belongs to the optional name and note: it reads as if the pick still had to be sent. "Tap" on a desktop.

**Where.** [ShareVersionVote.vue](../app/components/share/ShareVersionVote.vue); [pages/p/[id].vue](../app/pages/p/[id].vue) (where the panel sits).

**Options.**
- A) The instruction under the group's description, worded for any device ("choose the heart…"); "Saved" next to the pick once stored; the note's Save labelled "Save note".
- B) Only the "Saved" mark.

**Recommended.** A.

### UI-32 The lyrics panel of a shared playlist wraps almost every line on desktop

**Priority:** low · **Kind:** share pages · **Found:** 2026-11-06

**What is wrong.** On a playlist's share page the lyrics sit in a 24rem column with the full-screen view's large type: nearly every line wraps ("burning / sky"), and the box ends on a lone "CHORUS" heading, giving no hint that it scrolls.

**Where.** [pages/p/[id].vue](../app/pages/p/[id].vue) (the side column), [ShareLyrics.vue](../app/components/share/ShareLyrics.vue).

**Options.** A smaller type in that panel, and a fade at its bottom edge while there is more to scroll.

**Recommended.** Both.

### UI-33 "Nothing to delete" is a red button

**Priority:** low · **Kind:** polish · **Found:** 2026-11-06

**What is wrong.** In the Storage dialog, with no orphaned files the delete button reads "Nothing to delete" and is disabled, but Nuxt UI shows a disabled solid red button at 75% opacity: it looks like a live destructive action (the same problem as Save before UI-17).

**Where.** [StorageDialog.vue](../app/components/StorageDialog.vue), the footer.

**Options.**
- A) Hide the button when there is nothing to delete (the list already says "None").
- B) Neutral and subtle while disabled, red once there are files.

**Recommended.** A.

### UI-34 The upload drop zone shows no way to pick files

**Priority:** low · **Kind:** polish, touch screens · **Found:** 2026-11-06

**What is wrong.** The upload page's zone says "Drop your audio files here" with a faint dashed border and no button: the zone is clickable, but nothing says so, and on a phone or tablet nothing can be dropped.

**Where.** [pages/tracks/new.vue](../app/pages/tracks/new.vue), the `UFileUpload`.

**Options.** A "Choose files" button in the zone, the text "Drop audio files here, or choose them" (just "Choose audio files" on touch screens), and a stronger border.

**Recommended.** All three.

### UI-35 The "Select all" checkbox stays empty when some tracks are ticked

**Priority:** low · **Kind:** bug · **Found:** 2026-11-06

**What is wrong.** With 2 of 24 tracks ticked the selection bar's checkbox is empty instead of showing the partial state. The page passes `indeterminate` as a prop, which Nuxt UI 4's `UCheckbox` no longer has: the partial state is the model value `'indeterminate'`.

**Where.** [pages/index.vue](../app/pages/index.vue), the selection bar's `UCheckbox`.

**Options.** The model value `true`, `'indeterminate'` or `false` from the count.

**Recommended.** That, with a component or e2e check.

### UI-36 The playlist cover hint no longer says what the cover shows

**Priority:** low · **Kind:** wording · **Found:** 2026-11-06

**What is wrong.** Under a playlist's or group's cover: "Without a cover of its own, the playlist shows the covers of its first tracks." When those tracks have no covers either, it now shows its initials (since UI-20), and the rows show each track's artwork: a user sees initials where the hint promised track covers.

**Where.** [PlaylistEditor.vue](../app/components/playlist/PlaylistEditor.vue), the hint under the cover.

**Options.** "…shows the covers of its first tracks, or its initials when they have none."

**Recommended.** That wording.

### UI-37 The app's error page has no header or way around

**Priority:** low · **Kind:** polish · **Found:** 2026-11-06

**What is wrong.** A playlist or track that does not exist ("404 · Playlist not found") opens the bare error page: a small "404", the message and "Back to library", without the header, the navigation or the player, so it looks like the app broke. The share pages' own "not available" page keeps the header.

**Where.** [error.vue](../app/error.vue).

**Options.**
- A) The error page inside the default layout (header, navigation; the player bar if something plays).
- B) The logo and a larger message, without the layout.

**Recommended.** A for a signed-in user, B otherwise.

### UI-38 On small phones a playlist's title shrinks to a few letters

**Priority:** low · **Kind:** phones · **Found:** 2026-11-06

**What is wrong.** At 375px a playlist's and a group's page put "Play all" (with its text) and the pencil beside the title, which keeps a few letters ("Punic Wa…", "Teutobur…"). The track editor had the same problem and shows its buttons as icons on phones.

**Where.** [PlaylistEditor.vue](../app/components/playlist/PlaylistEditor.vue), the header.

**Options.**
- A) "Play all" as an icon on phones, like the track editor's Play.
- B) The title on its own line, the buttons under it.

**Recommended.** A.

### UI-39 Statistics call a group of versions a "Playlist", and an empty chart says nothing

**Priority:** low · **Kind:** wording · **Found:** 2026-11-06

**What is wrong.** In the list of items each one is "Track" or "Playlist": a group of versions is labelled "Playlist". "Plays per day" with no plays shows bare axes, with no "No plays yet".

**Where.** [pages/stats.vue](../app/pages/stats.vue) (the item's kind), [StatsDailyChart.vue](../app/components/stats/StatsDailyChart.vue).

**Options.** "Versions" for groups (from the purpose, as elsewhere); an empty-state line in the chart.

**Recommended.** Both.

### UI-40 Wording: "Public — Unlisted, and…", and a group's sharing text speaks of a playlist

**Priority:** low · **Kind:** wording · **Found:** 2026-11-06

**What is wrong.** The Public card says "Unlisted, and search engines may list it", which reads like a contradiction. The sharing box of a group of versions says "every track in this playlist".

**Where.** [utils/visibility.ts](../app/utils/visibility.ts); [ShareLinkBox.vue](../app/components/share/ShareLinkBox.vue) (`reach`).

**Options.** Public: "Anyone with the link, and search engines may list it." The sharing box: the purpose's nouns ("every version in this group").

**Recommended.** Both.

### UI-41 The password-reset messages differ from the forms around them

**Priority:** low · **Kind:** polish · **Found:** 2026-11-06

**What is wrong.** "Check your email" and "This link no longer works" use a smaller, paler heading than the forms' titles ("Welcome back", "Reset your password"), and the email address in "If an account exists for …" wraps at its hyphen ("ui-review- / mw4…").

**Where.** [pages/login.vue](../app/pages/login.vue), [pages/reset-password.vue](../app/pages/reset-password.vue).

**Options.** The forms' title style for those headings; the address in a `whitespace-nowrap` (or `break-all`) span.

**Recommended.** Both.

### UI-42 "Keyboard shortcuts" is in the account menu on touch screens

**Priority:** low · **Kind:** phones · **Found:** 2026-11-06

**What is wrong.** The account menu offers "Keyboard shortcuts" on phones and tablets, where there is usually no keyboard.

**Where.** [AppHeader.vue](../app/components/AppHeader.vue), the account menu.

**Options.** Shown only with a fine pointer (mouse or trackpad), as the volume slider is.

**Recommended.** That.

---

[Contents](../README.md#documentation)
