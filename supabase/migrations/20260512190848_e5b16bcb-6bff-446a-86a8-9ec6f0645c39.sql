
-- Public bucket for user media library
insert into storage.buckets (id, name, public)
values ('media-library', 'media-library', true)
on conflict (id) do nothing;

-- Storage policies: each user manages their own folder (user_id/...)
create policy "media-library: public read"
  on storage.objects for select
  using (bucket_id = 'media-library');

create policy "media-library: owner insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'media-library'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "media-library: owner update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'media-library'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "media-library: owner delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'media-library'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Media library table
create table public.media_library (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  public_url text not null,
  mime_type text,
  size_bytes bigint,
  media_kind text not null check (media_kind in ('image','video','audio','document','other')),
  source text,
  source_metadata jsonb default '{}'::jsonb,
  created_at timestamp with time zone not null default now()
);

create index idx_media_library_user on public.media_library(user_id, created_at desc);

alter table public.media_library enable row level security;

create policy "media_library owner select" on public.media_library
  for select to authenticated using (auth.uid() = user_id);
create policy "media_library owner insert" on public.media_library
  for insert to authenticated with check (auth.uid() = user_id);
create policy "media_library owner update" on public.media_library
  for update to authenticated using (auth.uid() = user_id);
create policy "media_library owner delete" on public.media_library
  for delete to authenticated using (auth.uid() = user_id);
