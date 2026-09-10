create table if not exists public.gc_ai_usage (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  provider text not null,
  model text not null,
  purpose text,
  ok boolean not null default true,
  status_code int,
  tokens int,
  error text
);

create index if not exists gc_ai_usage_created_idx on public.gc_ai_usage (created_at desc);

grant select on public.gc_ai_usage to authenticated;
grant all on public.gc_ai_usage to service_role;

alter table public.gc_ai_usage enable row level security;

create policy "service role manages ai usage"
on public.gc_ai_usage for all
to service_role
using (true) with check (true);