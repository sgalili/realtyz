create table public.city_alert_requests (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  requested_city text,
  preferences jsonb not null default '{}'::jsonb,
  consent_at timestamptz not null default now(),
  user_id uuid,
  status text not null default 'pending',
  error text,
  created_at timestamptz not null default now()
);
create unique index city_alert_requests_phone_city_day on public.city_alert_requests (phone, coalesce(requested_city,''), ((created_at at time zone 'UTC')::date));
alter table public.city_alert_requests enable row level security;
revoke all on public.city_alert_requests from anon, authenticated;
grant all on public.city_alert_requests to service_role;