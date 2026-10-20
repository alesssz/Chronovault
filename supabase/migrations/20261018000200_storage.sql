-- =============================================================================
-- ChronoPlayer — Storage
-- Private buckets; files are only readable through signed URLs.
-- Path convention: <user_id>/<track_id>.<ext>
--   audio  → audio/<user_id>/<track_id>.flac
--   covers → covers/<user_id>/<track_id>.webp
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('audio',  'audio',  false, 524288000, array['audio/*']),
  ('covers', 'covers', false, 10485760,  array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

-- True when the file belongs to a non-private track (used for sharing).
-- security definer: it must also see other users' 'unlisted' tracks.
create function public.is_shared_track_file(p_bucket text, p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tracks t
    where t.visibility <> 'private'
      and (
        (p_bucket = 'audio' and t.audio_path = p_path)
        or (p_bucket = 'covers' and t.cover_path = p_path)
      )
  );
$$;

revoke all on function public.is_shared_track_file(text, text) from public;
grant execute on function public.is_shared_track_file(text, text) to anon, authenticated;

create policy "storage: read own or shared files"
  on storage.objects for select
  to anon, authenticated
  using (
    bucket_id in ('audio', 'covers')
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or public.is_shared_track_file(bucket_id, name)
    )
  );

create policy "storage: upload into own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id in ('audio', 'covers')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Required for upserts (e.g. replacing a cover).
create policy "storage: overwrite in own folder"
  on storage.objects for update
  to authenticated
  using (
    bucket_id in ('audio', 'covers')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id in ('audio', 'covers')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "storage: delete in own folder"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id in ('audio', 'covers')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
