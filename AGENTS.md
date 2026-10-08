# Quadra — agent rules

## Vocab imports (do not ask again)

These are standing preferences for this repo. Apply on every vocab import without re-prompting.

1. **Translate missing sides — add anyway.**  
   If a note has only English, or only Japanese/Korean/Chinese (or only a reading), the user does not know the translation. **Translate the missing side and add the card.** Never skip a headword because one side is blank. Target language → `term`, English → `meaning`. Infer language from the deck they named or the note’s script.

2. **Skip duplicates.**  
   Match on the target-language term (ignore parenthetical readings and spacing). If it already exists, skip. Related but different words (e.g. 都会 vs 都会と田舎の間) are not duplicates.

3. **Audio on every new card.**  
   Generate TTS for `term`, upload via `/api/media/upload`, set `audioKey` + `audioSource: "tts"`. Never finish an import with silent new cards.  
   For short Japanese katakana loanwords, prefer hiragana input and a slightly slower rate (about `-20%`) so playback does not sound rushed.

4. **Every card gets a simple example + usage context.**  
   In `notes`, always include: (1) one short example sentence in the target language using the word naturally, (2) its English translation on the next line, (3) a brief note on how the word is generally used when that isn’t obvious from the gloss (register, near-synonyms, “not X”, common collocations). Do not leave provenance-only notes like `From sticky notes.` as the example. Keep useful disambiguation from the source when it helps.

5. **Japanese examples: hiragana, not romaji.**  
   In example sentences, put readings for harder kanji in parentheses as **hiragana** (e.g. `彼（かれ）の話（はなし）`). Never use English romaji in those parentheses (`kare`, `hanashi`). Keep the English translation on its own line after the Japanese.

6. Prefer the live cloud store (`https://quadra-tau.vercel.app/api/store` when that is the deployed app) so cards show up in study immediately.
7. Card orientation: English (`meaning`) front; target language (`term`) back — including Korean Hangul as the target script.

8. Study uses an Anki-style **new cards per day** cap (default **20** via `settings.anki.newCardsPerDay`). Do not remove or bypass this when changing queue logic. New cards must be **interleaved with reviews** (not dumped first); learning steps return mid-session. Same queue rules for every language/deck.
Also mirrored in `.cursor/rules/vocab-imports.mdc` (`alwaysApply: true`).

## Stack reminders

- Monorepo: `apps/web` (Next.js), `apps/mobile` (Expo), `packages/shared` (Anki SM-2).
- See `apps/web/AGENTS.md` / `apps/mobile/AGENTS.md` for framework-specific notes.
