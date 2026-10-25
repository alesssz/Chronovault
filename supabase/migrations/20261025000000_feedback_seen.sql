-- =============================================================================
-- Chronovault — feedback seen
--
-- When friends vote or leave a comment on a group of versions, the owner
-- should notice without opening every group: the app shows a dot on
-- "Versions" and a badge on the group's card. "New" means cast or changed
-- after the owner's last visit to the group, which this table remembers,
-- one row per group, on the server: the same on every device.
--
-- A table of its own rather than a column of `playlists`: every update of a
-- playlist moves its `updated_at` (trigger), which versions its cover
-- addresses; a visit must not look like an edit.
--
-- No row yet means the group was never visited since this feature: its
-- creation time is the reference, so every pick it got counts as new once.
-- =============================================================================

create table public.feedback_seen (
  playlist_id uuid primary key references public.playlists (id) on delete cascade,
  -- The owner's last visit to the group's page (set when they leave it).
  seen_at     timestamptz not null default now()
);

alter table public.feedback_seen enable row level security;

-- The group's owner only, through the same helper as playlist_tracks.
create policy "feedback seen: read own groups"
  on public.feedback_seen for select
  to authenticated
  using (private.owns_playlist(playlist_id));

create policy "feedback seen: insert own groups"
  on public.feedback_seen for insert
  to authenticated
  with check (private.owns_playlist(playlist_id));

create policy "feedback seen: update own groups"
  on public.feedback_seen for update
  to authenticated
  using (private.owns_playlist(playlist_id))
  with check (private.owns_playlist(playlist_id));

revoke all on table public.feedback_seen from anon, authenticated;
grant select, insert, update on table public.feedback_seen to authenticated;
