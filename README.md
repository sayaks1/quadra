# Quadra

Multilingual vocabulary for Korean, Japanese, and Chinese — desktop authoring + study, native iOS study, automatic sync.

Designed in **Vellum**: Field `#E9E9E6`, Card `#FBFBFA`, Oxblood `#6E2F2F`, Stone `#B5B2A9`, Ink `#1C1B1A`. Fraunces + Inter Tight.

## Monorepo

```
apps/web      Next.js desktop app (author + study)
apps/mobile  Expo iOS app (offline study)
packages/shared  Types, FSRS, seed data
supabase/migrations  Optional Postgres schema
```

## Quick start (desktop)

```bash
pnpm install
pnpm dev:web
```

Open [http://127.0.0.1:43127](http://127.0.0.1:43127).

Works offline with local seed decks (no API keys required). Browser speech / heuristic AI drafting are used when `OPENAI_API_KEY` is unset.

## iOS (Expo)

```bash
pnpm dev:mobile
# or
cd apps/mobile && pnpm start
```

On a Mac: press `i` for Simulator, or scan the QR code with Expo Go. Set `EXPO_PUBLIC_API_URL` to your machine’s LAN URL so the phone can sync to the web API.

Offline: the app caches the store in AsyncStorage and queues study updates; when the API is reachable it PUTs to `/api/store`.

## Environment

Copy `.env.example` to `apps/web/.env.local`:

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY` | TTS + AI notes→cards |
| `NEXT_PUBLIC_SUPABASE_*` | Optional cloud sync (schema in `supabase/migrations`) |
| `EXPO_PUBLIC_API_URL` | Mobile → web API base URL |

## Features

- **Study** with **Anki SM-2** scheduling (learning steps `1m 10m`, graduate at 1 day; learning cards stay in-session until day+)
- **Today** dashboard, **Added today**, global **Search**, **Settings** (tune steps / intervals)
- **Add card**, **Anki `.apkg` import**, **AI from notes** (review one-by-one)
- **AI TTS** with optional mic override
- Desktop + iOS auto-sync via `/api/store` (Supabase-ready schema included)

## Scripts

```bash
pnpm dev:web      # port 43127
pnpm dev:mobile
pnpm build        # production web build
```
