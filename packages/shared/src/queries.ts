import { isDue } from "./anki";
import type { AnkiConfig, Card, Deck, Rating, ReviewLog } from "./types";
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

function startOfLocalDay(now: Date) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return start;
}

/** True for cards that have never been answered (still in the new pile). */
export function isUnseenNew(card: Card) {
  return card.anki.phase === "new" && card.anki.reps === 0;
}

/**
 * How many cards had their first-ever review today (local day).
 * Each counts against the Anki-style new-cards-per-day budget.
 */
export function newCardsIntroducedToday(
  reviews: ReviewLog[],
  now = new Date(),
): number {
  if (!reviews.length) return 0;
  const start = startOfLocalDay(now).getTime();
  const end = now.getTime();
  const firstByCard = new Map<string, number>();
  for (const r of reviews) {
    const t = new Date(r.reviewedAt).getTime();
    const prev = firstByCard.get(r.cardId);
    if (prev === undefined || t < prev) firstByCard.set(r.cardId, t);
  }
  let n = 0;
  for (const t of firstByCard.values()) {
    if (t >= start && t <= end) n += 1;
  }
  return n;
}

export function dueCards(
  cards: Card[],
  now = new Date(),
  deckId?: string,
  config: AnkiConfig = DEFAULT_ANKI_CONFIG,
  reviews: ReviewLog[] = [],
) {
  const limit = config.newCardsPerDay ?? DEFAULT_ANKI_CONFIG.newCardsPerDay;
  const slotsLeft = Math.max(0, limit - newCardsIntroducedToday(reviews, now));

  const due = activeCards(cards)
    .filter((c) => (deckId ? c.deckId === deckId : true))
    .filter((c) => isDue(c, now, config, { learnAhead: true }))
    .sort((a, b) => new Date(a.anki.due).getTime() - new Date(b.anki.due).getTime());

  const unseenNew = due
    .filter(isUnseenNew)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const allowedNew = new Set(unseenNew.slice(0, slotsLeft).map((c) => c.id));

  return due.filter((c) => !isUnseenNew(c) || allowedNew.has(c.id));
}

export function cardsAddedToday(cards: Card[], now = new Date()) {
  const start = startOfLocalDay(now);
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

export function deckStats(
  cards: Card[],
  deckId: string,
  now = new Date(),
  config: AnkiConfig = DEFAULT_ANKI_CONFIG,
  reviews: ReviewLog[] = [],
) {
  const list = cardsForDeck(cards, deckId);
  const neu = list.filter(isUnseenNew).length;
  const learning = list.filter(
    (c) => c.anki.phase === "learning" || c.anki.phase === "relearning",
  ).length;
  const due = dueCards(list, now, undefined, config, reviews).length;
  const mature = list.filter((c) => c.anki.phase === "review" && c.anki.intervalDays >= 21).length;
  return { total: list.length, neu, learning, due, mature };
}

export function answeredToday(reviews: { reviewedAt: string }[], now = new Date()) {
  const start = startOfLocalDay(now);
  return reviews.filter((r) => new Date(r.reviewedAt) >= start).length;
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Consecutive days ending today (or yesterday) with at least one review. */
export function studyStreakDays(reviews: { reviewedAt: string }[], now = new Date()) {
  if (!reviews.length) return 0;
  const days = new Set(
    reviews.map((r) => {
      const d = new Date(r.reviewedAt);
      d.setHours(0, 0, 0, 0);
      return dayKey(d);
    }),
  );
  const cursor = new Date(now);
  cursor.setHours(0, 0, 0, 0);
  if (!days.has(dayKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!days.has(dayKey(cursor))) return 0;
  }
  let streak = 0;
  while (days.has(dayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function recallPercent(
  reviews: { rating: string }[],
): number {
  if (!reviews.length) return 0;
  const good = reviews.filter((r) => r.rating === "good" || r.rating === "easy").length;
  return Math.round((good / reviews.length) * 100);
}

export function estimateSessionMinutes(dueCount: number) {
  return Math.max(1, Math.round(dueCount * 0.35));
}

export type { Rating };
