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

### UI-1 The header overlaps between 640 and about 890px

**Priority:** high · **Kind:** layout bug · **Found:** 2026-11-04

**What is wrong.** From `sm` the section links show their names (Library, Playlists, Versions) next to the full logo; between 640 and about 890px wide the left group no longer fits and slides under the right one: at 768px "Versions" sits behind the "Add" button. Measured overflow of the left group: 250px at 640, 190 at 700, 122 at 768, 70 at 820, none from 900. It hits tablets in portrait and narrow desktop windows.

**Where.** [AppHeader.vue](../app/components/AppHeader.vue): the `hidden sm:inline` label of each section link, `AppLogo compact` (name from `sm`), the "Add" button labelled from `sm`.

**Options.**
- A) Section names from `lg` instead of `sm`: icons only (as on phones) up to 1024px.
- B) The logo's name from `lg`: the mark alone up to 1024px.
- C) Both.

**Recommended.** A; add B if the header still feels crowded at 1024px. Check at 640, 768, 820 and 1024.

### UI-2 The library search box shrinks to its icon between 640 and about 1000px

**Priority:** high · **Kind:** layout bug · **Found:** 2026-11-04

**What is wrong.** From `sm` the search box and the four filters share one row; the filters have fixed widths (`sm:w-40`, `sm:w-36`) and the search box takes what is left, which below about 1000px is 58px: only the magnifier shows, and what is typed cannot be read. It reaches 144px at 1024 and 400px at 1280.

**Where.** [pages/index.vue](../app/pages/index.vue), the toolbar above the list (`sm:flex-row`, search `sm:max-w-xs sm:flex-1`).

**Options.**
- A) Search on a row of its own up to `lg`, filters on the row below.
- B) A minimum width for the search box (`min-w-48`), letting the filters wrap.
- C) Fold the filters behind a single "Filters" button (see UI-6), which frees the row for the search box at every width.

**Recommended.** A now (a few classes); C if UI-6 is taken up.

### UI-3 On phones the player cannot be closed

**Priority:** high · **Kind:** layout bug · **Found:** 2026-11-04

**What is wrong.** The ✕ that closes the player sits in the right-hand column of the player bar, shown only from `md`. On phones the bar has cover, title, previous, play and next; the full-screen view has collapse, lyrics, Cast, Up next and Edit, but no close. Once something has played, the bar stays until sign-out, taking 5.5rem of every page.

**Where.** [PlayerBar.vue](../app/components/player/PlayerBar.vue) (the `hidden … md:flex` column with "Close player"), [PlayerExpanded.vue](../app/components/player/PlayerExpanded.vue) (header buttons).

**Options.**
- A) "Close player" in the full-screen view: a button in its header, or a ⋯ menu there holding it.
- B) Swipe down on the bar to close it (the bar already takes swipes: left/right change track, up opens the full-screen view, see `useTrackSwipe`).
- C) A small ✕ in the phone bar, at the cost of title width.

**Recommended.** A, plus B for those who expect it. C squeezes the title, which is already truncated on phones.

### UI-4 On small phones the player's controls fall below the screen

**Priority:** high · **Kind:** layout bug · **Found:** 2026-11-04

**What is wrong.** At 375×667 (iPhone SE and similar) the full-screen view gives the cover the whole width (`max-w-md`), so title, waveform and the controls come after it: play, previous and next are cut by the bottom edge and need a scroll. The share page of a track has the same problem: the Play button sits on the edge of the first screen.

**Where.** [PlayerExpanded.vue](../app/components/player/PlayerExpanded.vue), the cover section (`max-w-md` on phones; from `md` the width already depends on the height: `md:max-w-[max(20rem,min(32rem,calc(100dvh-23rem)))]`); [pages/t/[id].vue](../app/pages/t/[id].vue) (`max-w-sm` cover).

**Options.**
- A) Size the cover from the height on phones too, e.g. `max-w-[min(100%,calc(100dvh-24rem))]`, so the controls always fit the first screen.
- B) On short screens (`max-height` media query) a smaller cover and title.

**Recommended.** A, the same idea already used from `md`. Check at 375×667 and 390×844, with and without lyrics.

### UI-5 Editing a track starts with a whole screen of cover

**Priority:** medium · **Kind:** phones · **Found:** 2026-11-04

**What is wrong.** Below `md` the edit page stacks the side column above the form: a full-width cover (about 340px), "Change cover", the file details, Sharing and "Delete track". The first field (Title) appears after about two screens, and the Sync tab after Sharing and Delete. The title in the page header is cut to "Carthago D…" by three icon buttons (Play, Download, Save), and Save lives only up there: after scrolling down a long form it is out of reach. The same layout serves playlists and groups of versions.

**Where.** [pages/tracks/[id]/edit.vue](../app/pages/tracks/[id]/edit.vue) and [TrackEditSidebar.vue](../app/components/track/TrackEditSidebar.vue); [PlaylistEditor.vue](../app/components/playlist/PlaylistEditor.vue) (`md:grid-cols-[16rem_1fr]`, aside first).

**Options.**
- A) On phones, a compact row at the top (a small cover with "Change cover" beside it), then the form, then file details, sharing and delete at the bottom.
- B) A bar with Save fixed at the bottom (above the player bar) on phones, shown while there are unsaved changes.
- C) Cover, details and sharing in a tab of their own next to Details, Lyrics and Sync.

**Recommended.** A and B together, on all three editors. C hides sharing one tap further away.

### UI-6 The library's filters take a third of the screen

**Priority:** medium · **Kind:** phones · **Found:** 2026-11-04

**What is wrong.** On phones the search box and the four filters (genre, mastering, version, sort, in a 2×2 grid) take about 270px before the first track, about a third of a 390×844 screen. The count under the title ("24 tracks") ignores the filters, so a filtered list does not say how much it hides.

**Where.** [pages/index.vue](../app/pages/index.vue), the toolbar and the subtitle.

**Options.**
- A) Search plus a "Filters" button with the number of active filters, opening a bottom sheet with the four choices and "Clear".
- B) Filters as a horizontally scrolling row of chips.
- In both: the subtitle says "12 of 24 tracks" while filters are on.

**Recommended.** A; it also settles UI-2 (C) on tablets.

### UI-7 Every cover in the library is covered by a play button on touch screens

**Priority:** medium · **Kind:** phones · **Found:** 2026-11-04

**What is wrong.** On touch screens the ▶ overlay is always shown on every cover (`pointer-coarse:opacity-100`), so the list is a column of darkened covers with the same icon, and the covers themselves (the one visual clue to a track) barely show. A tap on the row already plays the track.

**Where.** [TrackList.vue](../app/components/track/TrackList.vue), the overlay `span` on the cover button.

**Options.**
- A) On touch screens show the overlay only on the current track (pause / loading), as on desktop when not hovered.
- B) A small ▶ badge in a corner of the cover instead of the full overlay.

**Recommended.** A.

### UI-8 The selection bar is four unlabelled icons on phones

**Priority:** medium · **Kind:** phones · **Found:** 2026-11-04

**What is wrong.** In selection mode the bar shows "N selected" and four icons (circle-check, list-plus, speech bubbles, bin) whose names appear only from `sm`; tooltips do not open on touch, so on a phone the meaning of "Mark final" and "Share for feedback" has to be guessed.

**Where.** [pages/index.vue](../app/pages/index.vue), the selection bar (`hidden sm:inline` labels).

**Options.**
- A) On phones, a bar fixed at the bottom of the screen with icon and short label per action (Final, Playlist, Feedback, Delete).
- B) Also enter selection mode with a long press on a row, as photo galleries do.

**Recommended.** A; B as a follow-up.

### UI-9 The versions of a song cannot be told apart

**Priority:** medium · **Kind:** phones · **Found:** 2026-11-04

**What is wrong.** Versions of a song share the start of their title ("Teutoburg (v1, slower)", "Teutoburg (v2, female vocals)"…), and on a phone the rows of a group show only "Teutoburg (…" three times: the part that tells them apart is the part cut off. It happens on the share page of the group, where friends are asked to pick one, and in the owner's editor.

**Where.** [pages/p/[id].vue](../app/pages/p/[id].vue) (track rows: number, cover, title with the WIP badge, duration, heart), [PlaylistTrackRow.vue](../app/components/playlist/PlaylistTrackRow.vue).

**Options.**
- A) In groups of versions, titles on up to two lines instead of truncated.
- B) On phones, drop what every row repeats: the WIP badge (all versions are drafts until one is chosen) and the duration.

**Recommended.** A and B together on the share page; A in the editor.

### UI-10 Statistics cut titles to a few letters on phones

**Priority:** medium · **Kind:** phones · **Found:** 2026-11-04

**What is wrong.** Each row of "Shared pages" puts views and visitors, then plays and "to the end", beside the title; at 390px the title keeps about 8 characters ("Thermop…", "Song of t…").

**Where.** [pages/stats.vue](../app/pages/stats.vue), the `stats-item` rows.

**Options.**
- A) On phones the numbers go on a line under the title.
- B) Only plays on phones, views and visitors from `sm`.

**Recommended.** A: nothing is lost.

### UI-11 The visibility choice wraps unevenly

**Priority:** medium · **Kind:** desktop and tablet · **Found:** 2026-11-04

**What is wrong.** The three visibility cards (Private, Unlisted, Public) are a horizontal radio group with descriptions of different lengths: at desktop widths Private and Unlisted fill the first row and Public sits alone on the second, each card as wide as its text. On phones the same cards are cramped.

**Where.** `URadioGroup` with `VISIBILITY_ITEMS` ([utils/visibility.ts](../app/utils/visibility.ts)) in [pages/tracks/[id]/edit.vue](../app/pages/tracks/[id]/edit.vue) and [PlaylistEditor.vue](../app/components/playlist/PlaylistEditor.vue).

**Options.**
- A) Three equal columns (`grid-cols-3` on the items) with shorter descriptions ("Only you", "Anyone with the link", "Link + search engines").
- B) Stacked vertically, at every width.
- C) A segmented control, with the description of the chosen option under it.

**Recommended.** A from `sm`, B below it.

### UI-12 A playlist's tracks start below the fold

**Priority:** medium · **Kind:** desktop and tablet · **Found:** 2026-11-04

**What is wrong.** On a playlist (and a group of versions) the page opens with title, description and visibility; at 1440×900, with the player bar, the track list starts at the bottom edge and is entirely below it on smaller screens, though it is what the page is mostly for. Visibility and description change rarely.

**Where.** [PlaylistEditor.vue](../app/components/playlist/PlaylistEditor.vue), the main column (form, then tracks, then feedback).

**Options.**
- A) Tracks first, then the form in a section that can be folded ("Details").
- B) The form in a dialog opened by an "Edit details" button in the header; the description shown as text under the title.

**Recommended.** B: the page becomes the playlist, not a form about it. A is the smaller change.

### UI-13 The share page of a playlist hides its tracks

**Priority:** medium · **Kind:** desktop and tablet · **Found:** 2026-11-04

**What is wrong.** On the share page of a playlist, at 1440×900, the cover takes the left column (26rem), so the Play button lands on the bottom edge and the track list is entirely below it; the right column shows the current track's lyrics. It is the first thing a friend sees when opening a link.

**Where.** [pages/p/[id].vue](../app/pages/p/[id].vue) (`lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]`, cover `lg:max-w-none`).

**Options.**
- A) A smaller cover (about 16–18rem) with title, summary and Play beside it, as a header row; the list right under it.
- B) Keep the layout, size the cover from the height (as in the full-screen player) so Play and the first tracks fit the first screen.

**Recommended.** A. Check the share page of a track as well, which has the same proportions.

### UI-14 The full-screen player without lyrics is half empty

**Priority:** medium · **Kind:** desktop and tablet · **Found:** 2026-11-04

**What is wrong.** From `md` the full-screen view has two columns: cover and controls, and the lyrics. A track without lyrics leaves the right half empty except for "No lyrics · Add lyrics from the track's edit page."

**Where.** [PlayerExpanded.vue](../app/components/player/PlayerExpanded.vue) (the `v-if="!isPhone"` lyrics section). Phones already show the track's description instead ("About this track").

**Options.**
- A) No lyrics: a single centred column.
- B) No lyrics: the description (and album, year, genre) in the right column, as phones do; the empty state only when there is neither.

**Recommended.** B, falling back to A when the track has no description either.

### UI-15 The icons of library rows do not line up

**Priority:** medium · **Kind:** desktop and tablet · **Found:** 2026-11-04

**What is wrong.** On each row the genre badge, the mastered, lyrics and visibility icons sit right-aligned together, and the badge's width depends on the genre's name ("Metal", "Ambient", "Folk"), so the icons move from row to row instead of forming columns.

**Where.** [TrackList.vue](../app/components/track/TrackList.vue), the `hidden md:flex` group.

**Options.**
- A) A fixed width for the genre (badge left-aligned in a column of about 7rem, truncated).
- B) The genre as plain text in its own column, the icons in fixed slots (an empty slot when a track has no lyrics).

**Recommended.** B: columns read faster than badges.

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

**What is wrong.** With nothing to save, the Save button of the editors is disabled, which Nuxt UI shows as the same gold button at 75% opacity: on a dark background it is hard to tell whether there is something to save.

**Where.** The Save buttons of [pages/tracks/[id]/edit.vue](../app/pages/tracks/[id]/edit.vue) and [PlaylistEditor.vue](../app/components/playlist/PlaylistEditor.vue).

**Options.**
- A) Neutral and subtle while there is nothing to save, gold (primary) once something changed.
- B) Keep the colour, change the label: "Saved" with a check while clean, "Save" when dirty.

**Recommended.** A; it pairs with the bottom bar of UI-5 (B), which appears only when there is something to save.

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
