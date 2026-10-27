# 9. API reference

All routes live in `server/api/`. **Auth:** every route requires a session cookie (`401` otherwise), except `/api/health`, `/api/keepalive`, `/api/plays` and `/api/shared/**`. **Errors:** JSON `{ statusCode, message }`; validation errors are `400` with per-field `data.issues` (a NUL character, U+0000, in any text is one of them: Postgres cannot store it); an item that is missing, private or someone else's is always `404`; the anonymous writes past their caps are `429` (`Limit reached`). Types: `shared/types/*.ts`; request bodies: `shared/schemas/*.ts`.

**Tracks and genres**

| Method | Path | Body | Response |
|---|---|---|---|
| `GET` | `/api/health` | | `{ status, time }` (public) |
| `GET` | `/api/keepalive` | | `{ status, time }` (public): one tiny database query, called daily by Vercel Cron ([13.7](13-deployment.md#137-keeping-supabase-awake)) |
| `GET` | `/api/tracks` | | `TrackSummary[]`, newest first |
| `POST` | `/api/tracks/upload-url` | `{ trackId, extension, mimeType, sizeBytes }` | `AudioUploadTarget` (PUT URL, 1 hour, signed for the declared size and type: another file gets `403` from the storage); `409` when the id is already registered (its file is never overwritten) |
| `POST` | `/api/tracks` | `trackCreateSchema` | `201 TrackDetail`; safe to repeat: the same registration again answers `201` with the track already there; `409` when the id is registered with another file |
| `GET` | `/api/tracks/:id` | | `TrackDetail` |
| `PATCH` | `/api/tracks/:id` | any subset of `trackMetadataSchema`, `coverPath` | `TrackDetail` |
| `DELETE` | `/api/tracks/:id` | | `204` |
| `GET` | `/api/tracks/:id/playback` | | `PlaybackSource { url, expiresAt }` (6 hours) |
| `GET` | `/api/genres` | | `Genre[]` |
| `POST` | `/api/genres` | `{ name }` | `Genre` (existing one if the name is taken) |
| `GET` | `/api/storage` | | `StorageReport`: usage (audio, covers) and orphaned files |
| `DELETE` | `/api/storage/orphans` | | `StorageCleanupResult`: deletes the orphans older than the minimum age |

**Covers** (images, cached by the browser for a year: `Cache-Control: private, max-age=31536000, immutable`)

| Method | Path | Response |
|---|---|---|
| `GET` | `/api/covers/tracks/:id?v=…` | The track's cover (WebP); `404` without a cover or for someone else's track |
| `GET` | `/api/covers/playlists/:id?v=…` | The playlist's custom cover (WebP); `404` without one |

The addresses come ready-made in `coverUrl` and `mosaic` of the track and playlist responses; `v` only changes the URL when the item changes.

**Playlists** (and groups of versions: the same routes, told apart by `purpose`)

| Method | Path | Body | Response |
|---|---|---|---|
| `GET` | `/api/playlists?purpose=playlist\|versions` | | `PlaylistSummary[]` of that purpose (default `playlist`), newest first; `400` for another value |
| `POST` | `/api/playlists` | `{ title, purpose?, description?, visibility?, trackIds? }` (`purpose` fixed from then on) | `201 PlaylistDetail` |
| `GET` | `/api/playlists/:id` | | `PlaylistDetail` |
| `PATCH` | `/api/playlists/:id` | any subset of `{ title, description, visibility, coverPath }` | `PlaylistDetail` |
| `DELETE` | `/api/playlists/:id` | | `204` (tracks stay in the library) |
| `PUT` | `/api/playlists/:id/tracks` | `{ trackIds }` (full ordered list) | `PlaylistDetail`; `404` when a track is not the user's (missing or someone else's), nothing written |
| `POST` | `/api/playlists/:id/tracks` | `{ trackIds }` (to append) | `PlaylistDetail`; `404` when a track is not the user's, nothing written |
| `GET` | `/api/playlists/:id/feedback` | | `VersionFeedback`: voting open, votes and plays per version, comments; `404` unless a group of versions |
| `POST` | `/api/playlists/:id/feedback/seen` | `{ at? }` (the `asOf` of the feedback on screen) | `204`: the group's feedback up to `at` is no longer new (never beyond now, never back); `404` unless the user's |
| `GET` | `/api/feedback/unseen` | | `UnseenFeedback`: new votes in total and per group, since the owner's last visit to each |

**Statistics**

| Method | Path | Response |
|---|---|---|
| `GET` | `/api/analytics?days=7` or `?days=30` | `AnalyticsReport`: totals, per day, per item, referrers, countries, devices (default 30 days; `400` for other values; `502` when Vercel Analytics fails) |
| `GET` | `/api/analytics/plays?days=7` or `?days=30` | `PlaysReport`: visitors' plays in total, per day and per share page, and the user's own plays apart |

**Public (no sign-in)**

| Method | Path | Response |
|---|---|---|
| `GET` | `/api/shared/:id` | `SharedTrack` |
| `GET` | `/api/shared/:id/playback` | `PlaybackSource` |
| `GET` | `/api/shared/:id/cover` | `302` to a fresh signed cover URL |
| `GET` | `/api/shared/playlists/:id` | `SharedPlaylist` (all tracks, shareable fields) |
| `GET` | `/api/shared/playlists/:id/tracks/:trackId/playback` | `PlaybackSource`, only for tracks of that playlist |
| `GET` · `HEAD` | `/api/stream?k=&e=&s=` | The address in every `PlaybackSource`: `HEAD` → `200` with type and size, `GET` → `302` to a presigned GET; `403` unless signed by the server and unexpired ([7.7](07-data-flows.md#77-expired-streaming-urls)) |
| `GET` | `/api/shared/playlists/:id/cover` | `302` to the custom cover, or the first track cover |
| `POST` | `/api/plays` | Body `{ trackId, playlistId?, listenerId, completed? }` → `204`; `404` where the caller cannot listen to that track; `429` for a new visitor of a track that already has 100 today |
| `GET` · `PUT` · `DELETE` | `/api/shared/playlists/:id/vote` | `VersionVoteState` (voting open, owner or not, this browser's pick): `GET` and `DELETE` take `?voter=<browser id>`, `PUT` takes `{ voterId, trackId, name?, comment? }`; `403` for the owner, `404` unless a shared group (or a version of it), `409` once a version is final, `429` for a new voter once the group has 50 votes |

---

← [8. Data model and security](08-data-model-and-security.md) · [Contents](../README.md#documentation) · [10. Configuration](10-configuration.md) →
