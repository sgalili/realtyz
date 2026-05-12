
create table if not exists public.email_login_otps (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  code_hash text not null,
  attempts int not null default 0,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists email_login_otps_email_idx on public.email_login_otps (email, created_at desc);
alter table public.email_login_otps enable row level security;

create or replace function public.cleanup_expired_email_login_otps()
returns void language sql security definer set search_path = public as $$
  delete from public.email_login_otps
  where expires_at < now() - interval '1 hour' or consumed_at is not null;
$$;
