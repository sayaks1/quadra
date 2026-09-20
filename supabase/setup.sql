-- Quadra one-shot setup (run in Supabase → SQL Editor → New query → Run)
-- Creates tables, Anki state, settings, media bucket, and anon policies
-- so the publishable key can sync a single-tenant personal app.

create extension if not exists "pgcrypto";

create table if not exists decks (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  language text not null check (language in ('ko','ja','zh','en','other')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists cards (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade,
  deck_id text not null references decks(id) on delete cascade,
  term text not null,
  reading text not null default '',
  meaning text not null default '',
  notes text not null default '',
  image_key text,
  audio_key text,
  audio_source text not null default 'none',
  anki jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Migrate legacy fsrs → anki if needed
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cards' and column_name = 'fsrs'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cards' and column_name = 'anki'
  ) then
    alter table cards rename column fsrs to anki;
  end if;
end $$;

alter table cards add column if not exists anki jsonb not null default '{}'::jsonb;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cards' and column_name = 'fsrs'
  ) then
    update cards set anki = coalesce(fsrs, '{}'::jsonb) where anki = '{}'::jsonb;
    alter table cards drop column fsrs;
  end if;
end $$;

create table if not exists reviews (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade,
  card_id text not null references cards(id) on delete cascade,
  rating text not null,
  reviewed_at timestamptz not null default now(),
  scheduled_days double precision not null default 0
);

create table if not exists settings (
  id text primary key default 'default',
  payload jsonb not null default '{}'::jsonb,
  version integer not null default 3,
  updated_at timestamptz not null default now()
);

create index if not exists cards_deck_id_idx on cards(deck_id);
create index if not exists cards_updated_at_idx on cards(updated_at);
create index if not exists decks_updated_at_idx on decks(updated_at);

alter table decks enable row level security;
alter table cards enable row level security;
alter table reviews enable row level security;
alter table settings enable row level security;

-- Personal app: allow anon (publishable key) full access.
-- Tighten these when you add real Supabase Auth.
drop policy if exists "decks_owner" on decks;
drop policy if exists "cards_owner" on cards;
drop policy if exists "reviews_owner" on reviews;
drop policy if exists "decks_anon_all" on decks;
drop policy if exists "cards_anon_all" on cards;
drop policy if exists "reviews_anon_all" on reviews;
drop policy if exists "settings_anon_all" on settings;

create policy "decks_anon_all" on decks for all using (true) with check (true);
create policy "cards_anon_all" on cards for all using (true) with check (true);
create policy "reviews_anon_all" on reviews for all using (true) with check (true);
create policy "settings_anon_all" on settings for all using (true) with check (true);

insert into storage.buckets (id, name, public)
values ('quadra-media', 'quadra-media', false)
on conflict (id) do nothing;

drop policy if exists "quadra_media_read" on storage.objects;
drop policy if exists "quadra_media_write" on storage.objects;
drop policy if exists "quadra_media_update" on storage.objects;
drop policy if exists "quadra_media_delete" on storage.objects;

create policy "quadra_media_read"
  on storage.objects for select
  using (bucket_id = 'quadra-media');

create policy "quadra_media_write"
  on storage.objects for insert
  with check (bucket_id = 'quadra-media');

create policy "quadra_media_update"
  on storage.objects for update
  using (bucket_id = 'quadra-media');

create policy "quadra_media_delete"
  on storage.objects for delete
  using (bucket_id = 'quadra-media');
