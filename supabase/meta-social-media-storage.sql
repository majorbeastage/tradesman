-- Public image staging for Meta Page/Instagram publishing.
-- Meta downloads image_url without Supabase authentication, so the bucket must be public.
-- Writes remain admin-only.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'meta-social-media',
  'meta-social-media',
  true,
  10485760,
  array['image/jpeg', 'image/png']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "meta_social_media_admin_insert" on storage.objects;
create policy "meta_social_media_admin_insert"
on storage.objects for insert
to authenticated
with check (bucket_id = 'meta-social-media' and public.is_admin());

drop policy if exists "meta_social_media_admin_update" on storage.objects;
create policy "meta_social_media_admin_update"
on storage.objects for update
to authenticated
using (bucket_id = 'meta-social-media' and public.is_admin())
with check (bucket_id = 'meta-social-media' and public.is_admin());

drop policy if exists "meta_social_media_admin_delete" on storage.objects;
create policy "meta_social_media_admin_delete"
on storage.objects for delete
to authenticated
using (bucket_id = 'meta-social-media' and public.is_admin());

drop policy if exists "meta_social_media_public_read" on storage.objects;
create policy "meta_social_media_public_read"
on storage.objects for select
to public
using (bucket_id = 'meta-social-media');

comment on table storage.objects is
  'Storage objects include admin-uploaded public Meta publishing media in bucket meta-social-media.';
