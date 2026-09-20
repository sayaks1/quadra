import { isDue } from "./anki";
import type { AnkiConfig, Card, Deck, Rating } from "./types";
import { DEFAULT_ANKI_CONFIG } from "./types";

export function activeCards(cards: Card[]) {
  return cards.filter((c) => !c.deletedAt);
}

export function activeDecks(decks: Deck[]) {
  return decks.filter((d) => !d.deletedAt);
}

export function cardsForDeck(cards: Card[], deckId: string) {
  return activeCards(cards).filter((c) => c.deckId === deckId);
}

export function dueCards(
  cards: Card[],
  now = new Date(),
  deckId?: string,
  config: AnkiConfig = DEFAULT_ANKI_CONFIG,
) {
  return activeCards(cards)
    .filter((c) => (deckId ? c.deckId === deckId : true))
    .filter((c) => isDue(c, now, config, { learnAhead: true }))
    .sort((a, b) => new Date(a.anki.due).getTime() - new Date(b.anki.due).getTime());
}

export function cardsAddedToday(cards: Card[], now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return activeCards(cards)
    .filter((c) => new Date(c.createdAt) >= start)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function searchCards(cards: Card[], query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return activeCards(cards);
  return activeCards(cards).filter((c) => {
    const hay = `${c.term} ${c.reading} ${c.meaning} ${c.notes}`.toLowerCase();
    return hay.includes(q);
  });
}

export function deckStats(cards: Card[], deckId: string, now = new Date()) {
  const list = cardsForDeck(cards, deckId);
  const neu = list.filter((c) => c.anki.phase === "new" || (c.anki.phase === "learning" && c.anki.reps === 0)).length;
  const learning = list.filter(
    (c) => c.anki.phase === "learning" || c.anki.phase === "relearning",
  ).length;
  const due = dueCards(list, now).length;
  const mature = list.filter((c) => c.anki.phase === "review" && c.anki.intervalDays >= 21).length;
  return { total: list.length, neu, learning, due, mature };
}

export function answeredToday(reviews: { reviewedAt: string }[], now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return reviews.filter((r) => new Date(r.reviewedAt) >= start).length;
}

export function estimateSessionMinutes(dueCount: number) {
  return Math.max(1, Math.round(dueCount * 0.35));
}

export type { Rating };
