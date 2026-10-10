# Quadra — agent rules

## Vocab imports (do not ask again)

These are standing preferences for this repo. Apply on every vocab import without re-prompting.

1. **Translate missing sides — add anyway.**  
   If a note has only English, or only Japanese/Korean/Chinese (or only a reading), the user does not know the translation. **Translate the missing side and add the card.** Never skip a headword because one side is blank. Target language → `term`, English → `meaning`. Infer language from the deck they named or the note’s script.

2. **Skip duplicates; group similar words.**  
   Match on the target-language term (ignore parenthetical readings and spacing). If it already exists, skip.  
   When notes contain many near-synonyms, shade/variation sets, or tightly related phrases (e.g. airline names, 画画 / 画油画 / 画得很好), **merge them into one flashcard** instead of creating a pile of tiny overlapping cards. Put the main form in `term`, list the clustered forms in `notes` (with a short example). Truly distinct senses stay separate (e.g. 都会 vs 都会と田舎の間).  
   **Exception — Chinese colors:** each color word (粉色、紫色、灰色、红色, etc.) and shade words 浅 / 深 get their **own** flashcard; do not cluster them.

3. **Audio on every new card.**  
   Generate TTS for `term`, upload via `/api/media/upload`, set `audioKey` + `audioSource: "tts"`. Never finish an import with silent new cards.  
   For short Japanese katakana loanwords, prefer hiragana input and a slightly slower rate (about `-20%`) so playback does not sound rushed.

4. **Every card gets a simple example + usage context.**  
   In `notes`, always include: (1) one short example sentence in the target language using the word naturally, (2) its English translation on the next line, (3) a brief note on how the word is generally used when that isn’t obvious from the gloss (register, near-synonyms, “not X”, common collocations). Do not leave provenance-only notes like `From sticky notes.` as the example. Keep useful disambiguation from the source when it helps.

4b. **Phrases get a word breakdown.**  
   If the term is a phrase, idiom, or multi-word expression (not a single dictionary word), add a `Breakdown:` line after the translation that glosses each content word/morpheme (e.g. `Breakdown: 귀가 = ears · 어둡다 = to be dark → “ears are dark” = hard of hearing / didn’t catch it`). Keep particles brief when they matter for the meaning.

5. **Japanese examples: hiragana, not romaji.**  
   In example sentences, put readings for harder kanji in parentheses as **hiragana** (e.g. `彼（かれ）の話（はなし）`). Never use English romaji in those parentheses (`kare`, `hanashi`). Keep the English translation on its own line after the Japanese.

5b. **Chinese cards get pinyin (reading + notes).**  
   Put tone-marked pinyin in `reading` for every Chinese card (e.g. `zhǔn bèi shèng dàn jié le`). Space syllables; keep list separators like `／` in the reading when the term is a cluster.  
   In `notes`, because the learner may not read characters yet: put a full pinyin line under every Chinese example sentence, and add `(pinyin)` after Chinese words/phrases in Breakdown and usage-context lines.

6. Prefer the live cloud store (`https://quadra-tau.vercel.app/api/store` when that is the deployed app) so cards show up in study immediately.
7. Card orientation: English (`meaning`) front; target language (`term`) back — including Korean Hangul as the target script.

8. Study uses an Anki-style **new cards per day** cap (default **20** via `settings.anki.newCardsPerDay`). Do not remove or bypass this when changing queue logic. New cards must be **interleaved with reviews** (not dumped first); learning steps return mid-session. Same queue rules for every language/deck.
Also mirrored in `.cursor/rules/vocab-imports.mdc` (`alwaysApply: true`).

## Stack reminders

- Monorepo: `apps/web` (Next.js), `apps/mobile` (Expo), `packages/shared` (Anki SM-2).
- See `apps/web/AGENTS.md` / `apps/mobile/AGENTS.md` for framework-specific notes.
