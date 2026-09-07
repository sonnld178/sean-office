-- RAG V1 — company memory + CV screening (pgvector 768)
-- File upload only, no website crawl. Service_role bypasses RLS.

-- pgvector + pgcrypto (gen_random_uuid)
create extension if not exists vector;
create extension if not exists "pgcrypto";

-- company_memories (owner = user_key, e.g. ip-based)
create table if not exists public.company_memories (
  id uuid primary key default gen_random_uuid(),
  user_key text not null,
  file_name text not null,
  created_at timestamptz not null default now()
);

-- cv_documents
create table if not exists public.cv_documents (
  id uuid primary key default gen_random_uuid(),
  user_key text not null,
  file_name text not null,
  created_at timestamptz not null default now()
);

-- memory_chunks
create table if not exists public.memory_chunks (
  id uuid primary key default gen_random_uuid(),
  memory_id uuid not null references public.company_memories(id) on delete cascade,
  chunk_index int not null,
  content text not null,
  embedding vector(768)
);

-- cv_chunks
create table if not exists public.cv_chunks (
  id uuid primary key default gen_random_uuid(),
  cv_id uuid not null references public.cv_documents(id) on delete cascade,
  chunk_index int not null,
  content text not null,
  embedding vector(768)
);

-- indexes on foreign keys + user_key
create index if not exists company_memories_user_key_idx on public.company_memories (user_key);
create index if not exists company_memories_created_idx on public.company_memories (created_at desc);
create index if not exists cv_documents_user_key_idx on public.cv_documents (user_key);
create index if not exists cv_documents_created_idx on public.cv_documents (created_at desc);
create index if not exists memory_chunks_memory_id_idx on public.memory_chunks (memory_id);
create index if not exists cv_chunks_cv_id_idx on public.cv_chunks (cv_id);
create index if not exists memory_chunks_chunk_idx on public.memory_chunks (memory_id, chunk_index);
create index if not exists cv_chunks_chunk_idx on public.cv_chunks (cv_id, chunk_index);

-- ivfflat cosine indexes (lists=100) — do block handles not exists
do $$
begin
  if not exists (
    select 1 from pg_indexes where schemaname='public' and indexname='memory_chunks_embedding_ivfflat'
  ) then
    execute 'create index memory_chunks_embedding_ivfflat on public.memory_chunks using ivfflat (embedding vector_cosine_ops) with (lists=100)';
  end if;
exception when others then
  -- ivfflat requires table to have rows or will error; ignore until data exists
  null;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_indexes where schemaname='public' and indexname='cv_chunks_embedding_ivfflat'
  ) then
    execute 'create index cv_chunks_embedding_ivfflat on public.cv_chunks using ivfflat (embedding vector_cosine_ops) with (lists=100)';
  end if;
exception when others then
  null;
end $$;

-- RLS (no policies — service_role bypasses)
alter table public.company_memories enable row level security;
alter table public.memory_chunks enable row level security;
alter table public.cv_documents enable row level security;
alter table public.cv_chunks enable row level security;

-- RPC: match_memory_chunks
create or replace function public.match_memory_chunks(
  query_embedding vector(768),
  match_count int,
  filter_user_key text
)
returns table (
  id uuid,
  memory_id uuid,
  content text,
  chunk_index int,
  similarity float
)
language sql stable
as $$
  select
    mc.id,
    mc.memory_id,
    mc.content,
    mc.chunk_index,
    1 - (mc.embedding <=> query_embedding) as similarity
  from public.memory_chunks mc
  join public.company_memories cm on cm.id = mc.memory_id
  where
    mc.embedding is not null
    and (filter_user_key is null or cm.user_key = filter_user_key)
  order by mc.embedding <=> query_embedding
  limit match_count;
$$;

-- RPC: match_cv_chunks
create or replace function public.match_cv_chunks(
  query_embedding vector(768),
  match_count int,
  filter_user_key text
)
returns table (
  id uuid,
  cv_id uuid,
  content text,
  chunk_index int,
  similarity float
)
language sql stable
as $$
  select
    cc.id,
    cc.cv_id,
    cc.content,
    cc.chunk_index,
    1 - (cc.embedding <=> query_embedding) as similarity
  from public.cv_chunks cc
  join public.cv_documents cd on cd.id = cc.cv_id
  where
    cc.embedding is not null
    and (filter_user_key is null or cd.user_key = filter_user_key)
  order by cc.embedding <=> query_embedding
  limit match_count;
$$;
