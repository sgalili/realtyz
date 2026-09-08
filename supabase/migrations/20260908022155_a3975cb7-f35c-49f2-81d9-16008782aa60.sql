create table if not exists public.fb_cloud_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_owner_id uuid not null references auth.users(id) on delete cascade,
  cookies_encrypted text,
  user_agent text,
  status text not null default 'inactive',
  last_verified_at timestamptz,
  expires_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_owner_id)
);

grant select, insert, update, delete on public.fb_cloud_sessions to authenticated;
grant all on public.fb_cloud_sessions to service_role;

alter table public.fb_cloud_sessions enable row level security;

drop policy if exists "owners manage their cloud session" on public.fb_cloud_sessions;
create policy "owners manage their cloud session"
on public.fb_cloud_sessions for all to authenticated
using (workspace_owner_id = auth.uid())
with check (workspace_owner_id = auth.uid());

drop trigger if exists trg_fb_cloud_sessions_updated_at on public.fb_cloud_sessions;
create trigger trg_fb_cloud_sessions_updated_at
before update on public.fb_cloud_sessions
for each row execute function public.update_updated_at_column();

alter table public.campaign_activity_queue
  add column if not exists runner text not null default 'extension',
  add column if not exists cloud_attempts integer not null default 0,
  add column if not exists runner_note text;

create index if not exists idx_caq_runner_due
  on public.campaign_activity_queue (runner, status, scheduled_for);