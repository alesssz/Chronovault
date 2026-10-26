# 16. Troubleshooting

| Problem | Solution |
|---|---|
| `Current version of Node.js … is unsupported` | Upgrade Node to 24.11+ (`nvm install 24`) |
| `pnpm: command not found` (e.g. from `make docker`) | pnpm is not installed for the Node in use: `npm i -g pnpm@12.14.0 --allow-scripts=pnpm`. With nvm (or nvm-windows), repeat it after installing a new Node version |
| `Cannot find native binding` / `postinstall: nuxt prepare exited with status 1` | Node is too old (e.g. Homebrew's 22.9): `pnpm install` skipped rolldown's native package. Switch to Node 24 (`nvm use`, or `nvm use 24` on Windows), then `pnpm install` again |
| Windows: `nvm use` says "exit status 1" or access denied | Run the terminal as administrator, or turn on Developer Mode (Settings → System → For developers) |
| `source ~/.zshrc` prints `command not found: compdef` (macOS) | Another tool's completion runs before zsh's: add `autoload -Uz compinit && compinit` on the line before it |
| `npm warn install-scripts … pnpm@12.14.0` | Harmless: pnpm works without its install script. `npm i -g pnpm@12.14.0 --allow-scripts=pnpm` silences it and uses the native binary |
| "Docker is not running" | Open Docker Desktop and wait for the engine; if it hangs while starting, use **Restart** from its tray menu. Windows: if it complains about WSL, run `wsl --update` in an administrator PowerShell |
| `supabase start` fails | Docker must be running; `pnpm db:stop`, then try again |
| `supabase start`: `Bind for 0.0.0.0:54322 failed: port is already allocated` | Another Supabase stack holds the ports: `docker ps` shows it (`supabase_db_<project>`). Often this very project under its old name: `pnpm exec supabase stop --project-id chronoplayer` (its data stays in Docker volumes) |
| Always sent back to `/login` locally | `.env` missing or stale: `make env`, then restart the dev server |
| `pnpm docker`: sign-in fails with `ERR_NAME_NOT_RESOLVED` on `host.docker.internal` | The host must resolve `host.docker.internal`. **macOS:** `echo "127.0.0.1 host.docker.internal" \| sudo tee -a /etc/hosts` (Docker Desktop for Mac never adds it). **Windows:** Docker Desktop → Settings → General → "Add the *.docker.internal names to the host's /etc/hosts file", or add `127.0.0.1 host.docker.internal` to `C:\Windows\System32\drivers\etc\hosts` with Notepad run as administrator. Or use `pnpm local`, which needs neither |
| Forgot the local login | Use the demo account, or look at Authentication → Users in Studio (http://127.0.0.1:54323) |
| `Failed to load because no supported source was found` | The audio URL could not be loaded (expired or wrong storage settings): press play again; if it persists check the `NUXT_AUDIO_STORAGE_*` values |
| `Audio format not supported` | The browser lacks that codec (e.g. some OGG files on older Safari). The file stays saved. |
| `Audio storage is not configured` (HTTP 500) | A `NUXT_AUDIO_STORAGE_*` variable is missing (Vercel settings, or `make env` locally) |
| Console: `Refused to load … because it violates the following Content Security Policy directive` (production build only) | The page reached an origin the policy does not list. A new service the browser talks to belongs in `server/utils/content-security-policy.ts`; for Supabase or the audio storage, check `NUXT_PUBLIC_SUPABASE_URL` / `SUPABASE_URL` and `NUXT_AUDIO_STORAGE_ENDPOINT`, which the policy is built from |
| Upload fails online with a CORS error | Add the site's origin (with `https://`) to the R2 CORS policy, then `pnpm r2:check https://<your-domain>` |
| R2 says "JSON not well formatted" when saving CORS | Paste exactly the JSON array of 13.2, with straight quotes |
| Sign-up email link leads to localhost | Set Site URL and Redirect URLs in Supabase (13.4) |
| A share link answers "not available" | The item is private (or the saved visibility is still private): set Unlisted/Public and **save** |
| Phone: nothing about the track on the lock screen | With the screen off Android shows nothing (always-on display aside, a phone setting). On the lock screen, check Settings → Notifications (or Sound) → "Show media on lock screen", and that the browser's notifications are not blocked |
| Phone: Cast says "Casting is not available here" | The browser refused. Read **the browser's answer** at the end of the message: `NotAllowedError … (a few ms)` with no picker shown means no casting service (Opera, Firefox and other browsers on Android cannot reach a Chromecast); `NotSupportedError` means the browser will not cast this audio, or not from here (e.g. try a Chrome tab instead of the installed app). Which browsers can: the table at the end of [7.5](07-data-flows.md#75-playback). **Temporary diagnostic page `/cast-test`** (signed in, linked from nowhere): five variants (the player's detached `<audio>`, an `<audio>` and a `<video>` in the page, and a static WAV, `public/cast-test.wav`, in both), each with its own Cast button and the browser's answers, and "Copy results". On a TCL Google TV none of them ever saw the TV (only the `<video>` rows opened a picker, which found nothing), while Chrome's own "Cast…" menu lists it; so a sixth row tries the **Google Cast Web Sender SDK** (`app/lib/google-cast.ts`, the route of that menu) with Google's default receiver: connect, then send the track or the WAV, and read the TV's player state in its log. Remove the page and the WAV once casting works |
| Phone: Cast says "No devices found" | The TV or speaker must have Chromecast built in (Android) or AirPlay (iPhone, iPad), be on, and be on the **same Wi-Fi**. TVs without either: use Android's screen mirroring. Bluetooth speakers need no button: pair them in Android's settings |
| Database types out of date | `make db-types` after every migration |
| First page load in `make dev` is very slow | Expected: Vite compiles dependencies on the first request |
| Dev server: `Vite discovered new dependencies at runtime`, then the page reloads | A package the browser imports is missing from `vite.optimizeDeps.include` in `nuxt.config.ts` ([10.3](10-configuration.md#103-notable-nuxtconfigts-settings)): add the names the message lists. `pnpm test` names it too, before the dev server does |
| Vercel: a deployment is **Blocked** | The commit author's email is not one of your GitHub account's (e.g. a work computer's global git identity). Use your own for this repository: `git config user.email <your GitHub email>`. For every personal project in one folder, add to `~/.gitconfig` `[includeIf "gitdir:~/Projects/others/"]` with `path = ~/.gitconfig-personal`, a file holding your `[user]` name and email. Then push a new commit: it deploys everything before it, so the blocked ones need nothing else |
| `pnpm local` starts Nuxt on a port other than 3100, or sign-in redirects go to the wrong address | Something else holds 3100 (often a server left by the e2e tests, which used 3100 before the port change): free it as in [Updating a computer set up before the port change](11-local-development.md#updating-a-computer-set-up-before-the-port-change), step 4 |
| E2E tests test an old version | A server is still running on :3200: stop it, Playwright then builds afresh |
| Every e2e test fails at once with `browserType.launch: Executable doesn't exist` | Playwright's Chromium is missing (new computer, or a Playwright update): `pnpm exec playwright install chromium`. `make test-e2e` does it for you (macOS: `~/Library/Caches/ms-playwright`, Windows: `%LOCALAPPDATA%\ms-playwright`) |
| Browser console: `preload … not used because it is a cross-world service worker resource mismatch` | Harmless: the PWA service worker serves files Chrome had already preloaded. Absent in `make local` (no service worker in development); DevTools → Application → Service workers → "Bypass for network" hides it on :8180 |
| Browser console: errors from `VM123:…` scripts (e.g. `reading 'startTime'` in `reportAllChanges`) | A browser extension, not the app (app files are `/_nuxt/….js`). A private window, without extensions, confirms it |
| `git commit`: "Permission denied" on Windows | An antivirus may lock files in `.git`: add the project folder to its exclusions |
| `make` not found on Windows | `winget install ezwinports.make`, then reopen Git Bash; or use the equivalent `pnpm` commands |
| Not sure what is missing on a new computer | `node scripts/doctor.mjs` (or `pnpm doctor`, `make doctor`): checks every prerequisite and prints the fix for your system |

---

← [15. Known limitations and next steps](15-limitations-and-next-steps.md) · [Contents](../README.md#documentation)
