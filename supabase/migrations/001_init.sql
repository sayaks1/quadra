-- Quadra schema (Supabase / Postgres)
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

create table if not exists reviews (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade,
  card_id text not null references cards(id) on delete cascade,
  rating text not null,
  reviewed_at timestamptz not null default now(),
  scheduled_days double precision not null default 0
);

create index if not exists cards_deck_id_idx on cards(deck_id);
create index if not exists cards_updated_at_idx on cards(updated_at);
create index if not exists decks_updated_at_idx on decks(updated_at);

alter table decks enable row level security;
alter table cards enable row level security;
alter table reviews enable row level security;

create policy "decks_owner" on decks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "cards_owner" on cards for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "reviews_owner" on reviews for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('quadra-media', 'quadra-media', false)
on conflict (id) do nothing;
