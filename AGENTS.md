# Quadra — agent rules

## Vocab imports from notes / PDFs / photos

When the user asks to add vocabulary from class notes, photos, PDFs, or similar:

1. **Never skip a headword because one side is missing.**  
   If the note has only English, only Japanese/Korean/Chinese, or only a reading with no gloss, **translate the missing side and add the card anyway**. Infer the intended target language from the deck the user named (or the note’s language). Put the target-language word in `term` and English in `meaning`.
2. **Do not add duplicates.** Match on the target-language term (ignore parenthetical readings and spacing). If a true duplicate exists, skip it; a related but different word (e.g. 都会 vs 都会と田舎の間) is not a duplicate.
3. **Every new card must have audio.** Generate TTS for the target-language `term`, upload via `/api/media/upload`, and set `audioKey` + `audioSource: "tts"` before finishing. Never leave newly added cards silent.
4. Prefer the live cloud store (`https://quadra-tau.vercel.app/api/store` when that is the user’s deployed app) over local-only changes so cards show up in study immediately.
5. Card orientation: English (`meaning`) on the front; target language (`term`) on the back — including Korean Hangul as the target script.

## Stack reminders

- Monorepo: `apps/web` (Next.js), `apps/mobile` (Expo), `packages/shared` (Anki SM-2).
- See `apps/web/AGENTS.md` / `apps/mobile/AGENTS.md` for framework-specific notes.
