-- Anki state (replaces FSRS), app settings, and media bucket policies
-- Safe to run on a fresh project after 001_init.sql

-- Prefer anki jsonb; migrate legacy fsrs if present
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'cards' and column_name = 'fsrs'
  ) and not exists (
    select 1 from information_schema.columns
    where table_name = 'cards' and column_name = 'anki'
  ) then
    alter table cards rename column fsrs to anki;
  end if;
end $$;

alter table cards add column if not exists anki jsonb not null default '{}'::jsonb;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'cards' and column_name = 'fsrs'
  ) then
    update cards set anki = fsrs where anki = '{}'::jsonb and fsrs is not null;
    alter table cards drop column fsrs;
  end if;
end $$;

create table if not exists settings (
  id text primary key default 'default',
  payload jsonb not null default '{}'::jsonb,
  version integer not null default 3,
  updated_at timestamptz not null default now()
);

alter table settings enable row level security;

-- Single-tenant sync via service role (bypasses RLS). Optional anon read of own rows
-- is left for a future auth pass; policies keep the tables locked down for clients.

insert into storage.buckets (id, name, public)
values ('quadra-media', 'quadra-media', false)
on conflict (id) do nothing;

-- Allow authenticated users to read/write their media when auth is added later.
-- Service role uploads/downloads bypass these policies.
drop policy if exists "quadra_media_read" on storage.objects;
drop policy if exists "quadra_media_write" on storage.objects;
drop policy if exists "quadra_media_update" on storage.objects;

create policy "quadra_media_read"
  on storage.objects for select
  using (bucket_id = 'quadra-media');

create policy "quadra_media_write"
  on storage.objects for insert
  with check (bucket_id = 'quadra-media');

create policy "quadra_media_update"
  on storage.objects for update
  using (bucket_id = 'quadra-media');
