# Quadra

Multilingual vocabulary for Korean, Japanese, and Chinese — desktop authoring + study, native iOS study, cloud sync.

Designed in **Vellum**: Field `#E9E9E6`, Card `#FBFBFA`, Oxblood `#6E2F2F`, Stone `#B5B2A9`, Ink `#1C1B1A`. Fraunces + Inter Tight.

## Monorepo

```
apps/web      Next.js desktop app (author + study)
apps/mobile  Expo iOS study app
packages/shared  Types, Anki SM-2, seed data
supabase/migrations  Postgres + Storage schema
```

## Quick start (desktop)

```bash
pnpm install
pnpm dev:web
```

Open [http://127.0.0.1:43127](http://127.0.0.1:43127).

Works offline with local seed decks (no API keys required). Progress is saved in the browser and mirrored to `apps/web/.data/store.json`.

## Cloud database (Supabase)

Without keys, Quadra stays on the local file store. To enable real cloud sync:

1. Create a free project at [supabase.com](https://supabase.com).
2. In the SQL editor, run **`supabase/setup.sql`** (one shot).
3. Copy `.env.example` → `apps/web/.env.local` and set:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_…`)
   - Optional: `SUPABASE_SECRET_KEY` (`sb_secret_…`) for elevated server sync
4. Restart `pnpm dev:web`.

The sidebar shows **Cloud** when Supabase is connected. Decks, cards, Anki progress, reviews, settings, and media (audio + images) sync through `/api/store` and `/api/media`.

## Images

- **Add card** and **Edit card** support image upload (png/jpg/webp/gif).
- Study shows the image on the **back** of the card with the target-language word.
- Anki `.apkg` import preserves images when the note HTML includes `<img>`.
- Files land in Supabase Storage (`quadra-media`) when configured, otherwise `apps/web/.data/media/`.

## iOS (Expo)

```bash
pnpm dev:mobile
```

Set `EXPO_PUBLIC_API_URL` to your machine’s LAN URL so the phone can reach the web API.

## Environment

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY` | TTS + AI notes→cards |
| `NEXT_PUBLIC_SUPABASE_URL` | Cloud project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Server sync + media (preferred) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Fallback if service role unset |
| `EXPO_PUBLIC_API_URL` | Mobile → web API base URL |

## Features

- **Study** with **Anki SM-2** (learning steps `1m 10m`, graduate at 1 day)
- English on the front, target language + audio + image + example on the back
- **Today**, **Search** (Added today filter), **Settings**
- **Add card**, **Anki import**, **AI from notes**
- Desktop + iOS sync via `/api/store` → Supabase when configured

## Scripts

```bash
pnpm dev:web      # port 43127
pnpm dev:mobile
pnpm build
```
