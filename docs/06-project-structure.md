# 6. Project structure

```
Chronovault/
├── app/                              # Frontend (Nuxt 4 srcDir)
│   ├── app.vue · error.vue           # Root component · fatal error page
│   ├── app.config.ts                 # Nuxt UI theme: gold, spectral blue, night blue (5.6)
│   ├── assets/css/main.css           # Tailwind + Nuxt UI, fonts and colour scales, base scale, room for the player bar
│   ├── components/
│   │   ├── AppHeader.vue · ConfirmDialog.vue · LeaveDialog.vue · StorageDialog.vue · CoverCropDialog.vue · DragHandle.vue
│   │   ├── AppLogo.vue · AppMark.vue  # the Chronovault logo (mark + name + tagline) · the mark alone (5.6)
│   │   ├── KeyboardShortcutsDialog.vue  # the list of the player's keyboard shortcuts (the ? key)
│   │   ├── IconButton.vue · ThemeButton.vue  # icon-only buttons with their tooltip · light/dark switch
│   │   ├── SaveBar.vue · LibraryFilters.vue  # the editors' Save bar below 768px · the library's filters and sort
│   │   ├── player/                   # PlayerBar, PlayerExpanded, PlayerQueue + PlayerQueueList (Up next),
│   │   │                             #   PlayerWaveform, PlayerControls, PlayerVolume, PlayerCastButton
│   │   ├── lyrics/                   # LyricsView, LyricsSyncEditor (tap to sync: the screen around lib/lyrics-sync.ts),
│   │   │                             #   LyricsSyncTimeline (markers), LyricsLrcDialog (LRC import / export),
│   │   │                             #   LyricsSyncClock (the editor's playback time, rendered alone)
│   │   ├── playlist/                 # PlaylistCover (custom or mosaic), PlaylistCreateDialog,
│   │   │                             #   PlaylistEditor (owner page of both purposes) + PlaylistTrackRow (one row of its list)
│   │   │                             #   + PlaylistDetailsDialog (its "Edit details": title, description, visibility),
│   │   │                             #   PlaylistGrid (cards),
│   │   │                             #   PlaylistVersionFeedback (a group's votes, plays and comments)
│   │   ├── share/                    # ShareLinkBox (editors' sharing box), SharePlayer + ShareMiniPlayer, ShareUnavailable,
│   │   │                             #   ShareVersionVote (a group's vote panel), ShareLyrics (lyrics following the player) (public pages)
│   │   ├── stats/                    # StatsDailyChart (one number per day: views, plays), StatsBreakdown (referrers, countries, devices)
│   │   └── track/                    # TrackList, TrackCover, TrackCoverPicker, the editor's TrackEditSidebar (file,
│   │                                 #   sharing, deletion) and TrackGenreSelect (genre field, custom genres created in it)
│   ├── composables/                  # useTrackUploader (upload queue), useGenres, usePlaylists, useShareLink,
│   │                                 #   useQueueActions (Play next / Add to queue with toasts), useTrackDownload,
│   │                                 #   useAsyncTask, useEditForm, useLeaveConfirm (LeaveDialog: unsaved work, 7.8),
│   │                                 #   useCoverEditor, useCoverStorage, useSortableList,
│   │                                 #   useSharePage (useSharedItem, useShareMeta), useSignedInRedirect (see 5.5),
│   │                                 #   touch: useCloseOnBack (Android back), useSwipeToDismiss, useTrackSwipe (7.5),
│   │                                 #   useLongPress (a long press on a library row starts selecting, 7.17),
│   │                                 #   useRemotePlayback (Cast to a TV or speaker, 7.5), useVersionVote (a visitor's pick, 7.17),
│   │                                 #   useUnseenFeedback (new votes: the dot on "Versions", 7.17),
│   │                                 #   useVersionFeedback (a group's feedback on its owner page, the visit recorded: 7.17),
│   │                                 #   useKeyboardShortcuts (useKeyboardClaim, useShortcutsHelp: 7.5),
│   │                                 #   usePageTitle (browser tab titles: "Library · Chronovault")
│   ├── layouts/                      # default (header + player), auth (sign-in), public (share pages + full-screen view)
│   ├── lib/                          # Browser code without Vue
│   │   ├── audio-engine.ts           #   the single <audio> element and its events
│   │   ├── audio-analysis.ts         #   tags, cover, duration, peaks
│   │   ├── direct-upload.ts          #   PUT to a presigned URL with progress and retries
│   │   ├── bytes.ts                  #   concatBytes, asciiAt (binary file code)
│   │   ├── image.ts                  #   crop geometry, square WebP covers
│   │   ├── queue-storage.ts          #   saved play queue (localStorage)
│   │   ├── queue-order.ts            #   shuffle rules: shuffle, unshuffle, new round
│   │   ├── player/                   #   the player store's parts (7.5): queue.ts (queue and order) · playback.ts
│   │   │                             #   (loaded track, engine, expired URLs) · sources.ts · settings.ts · types.ts
│   │   ├── lyrics-sync.ts            #   the sync editor's rows and actions: stamp, undo, replay, nudge… (7.9)
│   │   ├── library-request.ts        #   the library read, shared while the app opens and by callers asking at once (7.2)
│   │   ├── feedback-playlist.ts      #   name of the "Share for feedback" playlist
│   │   ├── play-tracker.ts           #   when listening becomes a play (30 s or half; completed at 90%)
│   │   ├── keyboard-shortcuts.ts     #   the player's shortcuts: which key does what, and when a key is someone else's
│   │   ├── listener-id.ts            #   this browser's random id, for plays and votes
│   │   ├── storage-keys.ts           #   every localStorage key, and the move from the former chronoplayer: names
│   │   ├── web-analytics.ts          #   which pages Vercel Web Analytics may count
│   │   ├── save-file.ts              #   hands a file built in the browser to the user
│   │   ├── haptics.ts                #   short vibrations as touch feedback (Android)
│   │   ├── tags/                     #   tags for downloads: track-tags · flac-tags · id3-tags · wav-tags
│   │   ├── media-session.ts · theme.ts  #   lock-screen card · waveform colours from the theme
│   │   ├── google-cast.ts            #   Google Cast Web Sender SDK, loaded on demand (only /cast-test, temporary)
│   │   └── flac/                     #   wav.ts (parser) · encoder.ts (encode + verify) · flac.worker.ts · convert.ts
│   ├── pages/
│   │   ├── index.vue                 # Library
│   │   ├── login.vue · confirm.vue   # Sign-in / sign-up / forgot password · auth callback
│   │   ├── reset-password.vue        # New password, from the reset email's link
│   │   ├── tracks/new.vue            # Upload
│   │   ├── tracks/[id]/edit.vue      # Track editor (details, lyrics, sync)
│   │   ├── playlists/index.vue       # Playlists
│   │   ├── playlists/[id].vue        # Playlist editor (PlaylistEditor)
│   │   ├── versions/index.vue        # Versions (groups made by "Share for feedback")
│   │   ├── versions/[id].vue         # Group of versions (PlaylistEditor)
│   │   ├── stats.vue                 # Statistics (visits and plays of the share links)
│   │   ├── cast-test.vue             # TEMPORARY Cast diagnostic page, signed in, linked from nowhere (16)
│   │   ├── t/[id].vue                # Public track page (SSR)
│   │   └── p/[id].vue                # Public playlist page (SSR)
│   ├── plugins/                      # 00.storage-keys.client.ts (moves keys saved under the former name, first) · media-session.client.ts · queue-persistence.client.ts · web-analytics.client.ts
│   │                                 #   · play-counter.client.ts (reports plays, 7.16) · keyboard-shortcuts.client.ts (7.5)
│   ├── services/api.ts               # Typed API client (the only place that knows the URLs)
│   ├── stores/player.ts              # Player store: puts together the parts in lib/player/ behind one API
│   └── utils/                        # errors (human-readable messages) · clipboard · visibility (labels, icons) · playlist-purpose
├── server/                           # Backend (Nitro)
│   ├── api/                          # HTTP routes (see section 9)
│   ├── services/                     # tracks · genres · playlists · sharing · storage-cleanup · covers · analytics (+ analytics-demo)
│   │                                 #   · plays (Statistics) · feedback (plays, votes, new feedback)
│   │                                 #   · playback (streaming addresses, cover file removal)
│   ├── repositories/                 # tracks · genres · playlists · sharing · storage (covers) · audio-storage (R2, signed streaming addresses) · web-analytics (Vercel API) · keepalive · feedback (plays, votes, visits)
│   │                                 #   · pages (readAllPages: lists past PostgREST's 1000 rows)
│   ├── mappers/                      # track.ts · playlist.ts (rows ↔ domain types) · cover-urls.ts (cacheable cover addresses)
│   ├── plugins/                      # content-security-policy.ts (the pages' CSP and its nonce, 8.5)
│   ├── dev/stale-service-worker.ts   # development only: a /sw.js that unregisters a production service worker left on the port
│   └── utils/                        # auth (requireAuth, visitorClient) · validation · errors · audio-storage · covers (cache headers) · web-analytics (data source)
│                                     #   · storage-cleanup (the orphans' minimum age, from the runtime config)
│                                     #   · content-security-policy (the policy, built from the runtime config)
├── shared/                           # Pure code used by client and server
│   ├── brand.ts                      # Name, tagline, colours, fallback cover, the mark's geometry (5.6)
│   ├── schemas/                      # track.ts · playlist.ts · analytics.ts · feedback.ts (Zod)
│   ├── types/                        # track.ts · playlist.ts · storage.ts · analytics.ts · database.types.ts (generated)
│   └── utils/                        # lyrics (LRC) · peaks · storage-paths · audio-files · time · text · numbers · arrays
├── supabase/
│   ├── config.toml                   # Local stack (ports, auth settings, S3 protocol)
│   ├── migrations/                   # Versioned schema (section 8.2)
│   ├── seed.sql                      # Local demo user
│   ├── templates/recovery.html       # The reset email (also pasted into the Supabase project, 13.4)
│   └── tests/database/               # pgTAP: rls.test.sql · playlists.test.sql · plays_votes.test.sql · function_privileges.test.sql · feedback_seen.test.sql · write_caps.test.sql · storage_paths.test.sql · playlist_track_rules.test.sql · track_genres.test.sql
├── test/
│   ├── unit/                         # Vitest in Node: app/, server/, shared/, scripts/, config/ (nuxt.config.ts, brand checks, pnpm and Node versions of the Dockerfile)
│   ├── nuxt/                         # Vitest in a Nuxt environment: components and composables
│   └── e2e/                          # Playwright: auth, password-reset, library, sharing, playlists, queue, persistent-queue, cover-cache, cover-crop, download, lrc-transfer, storage, stats, versions, feedback, feedback-badge, share-player, library-virtual-scroll, track-change, track-registration, upload-leave, text-input, unsaved-changes, playlist-writes, lyrics-scroll, sync-tab, keyboard, streaming, keepalive, security-headers, theme-contrast, lyrics-readability, desktop-layout, responsive (phone + tablet)
│                                     #   · fixtures.ts (the specs' test/expect: a test fails on any CSP violation) · helpers.ts
├── scripts/
│   ├── stack.mjs                     # pnpm local / docker / stop
│   ├── lib/local-stack.mjs           # Docker check, Supabase status, .env writing
│   ├── setup-env.mjs                 # pnpm env:local
│   ├── gen-types.mjs                 # pnpm db:types
│   ├── check-r2.mjs                  # pnpm r2:check
│   ├── doctor.mjs                    # pnpm doctor (prerequisites check) · lib/doctor-checks.mjs
│   ├── merge-main.mjs                # pnpm merge:main
│   ├── lib/merge-message.mjs         # cumulative merge commit message
│   └── generate-brand.mjs            # pnpm generate:brand (favicon, PWA icons, fallback cover)
├── brand/chronovault.jpg             # The Chronovault artwork: source of the fallback cover
├── docs/                             # This documentation: 00-setup.md … 16-troubleshooting.md, one file per section (index in README.md)
│   ├── backlog.md                    # Work known and waiting, one entry per point (UI-n, FEAT-n…); deleted when done
│   └── superpowers/                  # Design specs and implementation plans of past features (kept as written then)
├── public/                           # Favicon, PWA icons, fallback cover (generated, see 5.6) · cast-test.wav (the /cast-test page's WAV)
├── Dockerfile · compose.yaml · .dockerignore
├── Makefile · package.json · pnpm-lock.yaml · pnpm-workspace.yaml
├── vercel.json                       # Vercel Cron: GET /api/keepalive every day at 06:00 UTC (13.7)
├── .nvmrc · .nuxtrc                  # Node 24 (nvm) · the @nuxt/test-utils setup
├── nuxt.config.ts · vitest.config.ts · playwright.config.ts · eslint.config.mjs · tsconfig.json
├── .env.example · .env.r2.example    # Templates (the real .env files are git-ignored)
└── .github/                          # workflows/ci.yml (checks, 12) · workflows/audit.yml (dependency audit: weekly and on every branch that changes them, 11.6)
                                      #   · dependabot.yml (GitHub Actions updates only, 11.6)
```

---

← [5. Architecture](05-architecture.md) · [Contents](../README.md#documentation) · [7. Data flows](07-data-flows.md) →
