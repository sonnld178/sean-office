-- SeanOffice AI job queue (ai_jobs)
-- Browser never touches Supabase directly: all access goes through Next.js
-- API routes using SUPABASE_SERVICE_ROLE_KEY. RLS enabled with no public
-- policies (service_role bypasses RLS).

create table if not exists public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  user_key text not null,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'done', 'error')),
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create index if not exists ai_jobs_status_created_idx
  on public.ai_jobs (status, created_at asc);

create index if not exists ai_jobs_user_created_idx
  on public.ai_jobs (user_key, created_at desc);

alter table public.ai_jobs enable row level security;
