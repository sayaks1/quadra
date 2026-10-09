import { isDue, startOfStudyDay } from "./anki";
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

/** True for cards that have never been answered (still in the new pile). */
export function isUnseenNew(card: Card) {
  return card.anki.phase === "new" && card.anki.reps === 0;
}

/**
 * How many unseen new cards were introduced today (local day).
 * Counts against that deck's Anki-style new-cards-per-day budget.
 * Pass `cardIds` to scope to one deck. Pass `cards` so legacy logs
 * (before `newIntro`) are not confused with Anki-imported review cards.
 */
export function newCardsIntroducedToday(
  reviews: ReviewLog[],
  now = new Date(),
  cardIds?: Set<string>,
  cards: Card[] = [],
  config: AnkiConfig = DEFAULT_ANKI_CONFIG,
): number {
  if (!reviews.length) return 0;
  const start = startOfStudyDay(now, config).getTime();
  const end = now.getTime();
  const cardById = new Map(cards.map((c) => [c.id, c]));

  const byCard = new Map<string, ReviewLog[]>();
  for (const r of reviews) {
    if (cardIds && !cardIds.has(r.cardId)) continue;
    const list = byCard.get(r.cardId) ?? [];
    list.push(r);
    byCard.set(r.cardId, list);
  }

  let n = 0;
  for (const [cardId, list] of byCard) {
    list.sort((a, b) => a.reviewedAt.localeCompare(b.reviewedAt));
    const today = list.filter((r) => {
      const t = new Date(r.reviewedAt).getTime();
      return t >= start && t <= end;
    });
    if (!today.length) continue;

    if (today.some((r) => r.newIntro === true)) {
      n += 1;
      continue;
    }
    // Explicitly marked non-intro (or only legacy logs without the flag).
    if (list.some((r) => r.newIntro === true)) continue;
    if (today.some((r) => r.newIntro === false)) continue;

    // Legacy fallback: first-ever Quadra review today, but skip Anki imports
    // that already had scheduling reps and no prior Quadra review history.
    const first = list[0];
    const firstT = new Date(first.reviewedAt).getTime();
    if (firstT < start || firstT > end) continue;
    const card = cardById.get(cardId);
    if (!card) continue;
    if (card.anki.reps > list.length) continue;
    n += 1;
  }
  return n;
}

/** Rough seconds per card — used to place learning steps mid-queue. */
const QUEUE_CARD_SECONDS = 15;

function dueTime(card: Card) {
  return new Date(card.anki.due).getTime();
}

/**
 * Spread new cards evenly through the review pile (Anki "mix new/reviews").
 * Same algorithm for every deck/language — no language-specific branching.
 */
export function distributeNewAmongReviews(reviews: Card[], news: Card[]): Card[] {
  if (!news.length) return reviews;
  if (!reviews.length) return news;
  const result: Card[] = [];
  const R = reviews.length;
  const N = news.length;
  let ri = 0;
  for (let i = 0; i < N; i++) {
    const targetReviews = Math.floor(((i + 1) * R) / (N + 1));
    while (ri < targetReviews) {
      result.push(reviews[ri++]);
    }
    result.push(news[i]);
  }
  while (ri < R) result.push(reviews[ri++]);
  return result;
}

/**
 * Insert a learning card where its step delay should land in the session,
 * instead of burying it behind every remaining new card.
 */
export function insertLearningIntoQueue(
  rest: Card[],
  card: Card,
  now = new Date(),
): Card[] {
  const dueMs = dueTime(card);
  const nowMs = now.getTime();
  const delayMs = Math.max(0, dueMs - nowMs);
  // Aim for the step delay; always leave at least one other card first when
  // the step is still in the future.
  let insertAt = Math.round(delayMs / (QUEUE_CARD_SECONDS * 1000));
  if (dueMs > nowMs + 2000) insertAt = Math.max(1, insertAt);
  insertAt = Math.min(rest.length, insertAt);

  // Prefer sitting ahead of a long run of unseen new cards once the step is due.
  if (dueMs <= nowMs) {
    const firstNew = rest.findIndex(isUnseenNew);
    if (firstNew >= 0) insertAt = Math.min(insertAt, firstNew);
  }

  const next = rest.slice();
  next.splice(insertAt, 0, card);
  return next;
}

/**
 * Anki-like display order (identical for all languages):
 * 1. Learning/relearning cards that are already due
 * 2. Reviews with new cards distributed evenly among them
 * 3. Learn-ahead learning cards parked at their estimated step position
 */
export function orderStudyQueue(cards: Card[], now = new Date()): Card[] {
  const nowMs = now.getTime();
  const learningDue: Card[] = [];
  const learningLater: Card[] = [];
  const reviews: Card[] = [];
  const news: Card[] = [];

  for (const c of cards) {
    if (c.anki.phase === "learning" || c.anki.phase === "relearning") {
      if (dueTime(c) <= nowMs) learningDue.push(c);
      else learningLater.push(c);
    } else if (isUnseenNew(c)) {
      news.push(c);
    } else {
      reviews.push(c);
    }
  }

  learningDue.sort((a, b) => dueTime(a) - dueTime(b));
  learningLater.sort((a, b) => dueTime(a) - dueTime(b));
  reviews.sort((a, b) => dueTime(a) - dueTime(b));
  news.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  let queue = [...learningDue, ...distributeNewAmongReviews(reviews, news)];
  for (const c of learningLater) {
    queue = insertLearningIntoQueue(queue, c, now);
  }
  return queue;
}

export function dueCards(
  cards: Card[],
  now = new Date(),
  deckId?: string,
  config: AnkiConfig = DEFAULT_ANKI_CONFIG,
  reviews: ReviewLog[] = [],
) {
  const limit = config.newCardsPerDay ?? DEFAULT_ANKI_CONFIG.newCardsPerDay;

  const pool = activeCards(cards).filter((c) =>
    deckId ? c.deckId === deckId : true,
  );
  const due = pool.filter((c) => isDue(c, now, config, { learnAhead: true }));

  // Budget is per deck (Anki-style): studying Chinese must not shrink Japanese.
  const idsByDeck = new Map<string, Set<string>>();
  for (const c of pool) {
    let set = idsByDeck.get(c.deckId);
    if (!set) {
      set = new Set();
      idsByDeck.set(c.deckId, set);
    }
    set.add(c.id);
  }

  const newByDeck = new Map<string, Card[]>();
  for (const c of due) {
    if (!isUnseenNew(c)) continue;
    const list = newByDeck.get(c.deckId) ?? [];
    list.push(c);
    newByDeck.set(c.deckId, list);
  }

  const allowedNew = new Set<string>();
  for (const [id, news] of newByDeck) {
    news.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    const introduced = newCardsIntroducedToday(
      reviews,
      now,
      idsByDeck.get(id) ?? new Set(),
      pool,
      config,
    );
    const slotsLeft = Math.max(0, limit - introduced);
    for (const c of news.slice(0, slotsLeft)) allowedNew.add(c.id);
  }

  const filtered = due.filter((c) => !isUnseenNew(c) || allowedNew.has(c.id));
  return orderStudyQueue(filtered, now);
}

export function cardsAddedToday(
  cards: Card[],
  now = new Date(),
  config: AnkiConfig = DEFAULT_ANKI_CONFIG,
) {
  const start = startOfStudyDay(now, config);
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
  const dueList = dueCards(list, now, undefined, config, reviews);
  const due = dueList.length;
  /** Unseen new cards included in today's capped study queue */
  const newDue = dueList.filter(isUnseenNew).length;
  const mature = list.filter((c) => c.anki.phase === "review" && c.anki.intervalDays >= 21).length;
  return { total: list.length, neu, learning, due, newDue, mature };
}

export function answeredToday(
  reviews: { reviewedAt: string }[],
  now = new Date(),
  config: AnkiConfig = DEFAULT_ANKI_CONFIG,
) {
  const start = startOfStudyDay(now, config);
  return reviews.filter((r) => new Date(r.reviewedAt) >= start).length;
}

function studyDayKey(d: Date, config: AnkiConfig = DEFAULT_ANKI_CONFIG) {
  const start = startOfStudyDay(d, config);
  return `${start.getFullYear()}-${start.getMonth()}-${start.getDate()}`;
}

/** Consecutive study days ending today (or yesterday) with at least one review. */
export function studyStreakDays(
  reviews: { reviewedAt: string }[],
  now = new Date(),
  config: AnkiConfig = DEFAULT_ANKI_CONFIG,
) {
  if (!reviews.length) return 0;
  const days = new Set(
    reviews.map((r) => studyDayKey(new Date(r.reviewedAt), config)),
  );
  const cursor = startOfStudyDay(now, config);
  if (!days.has(studyDayKey(cursor, config))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!days.has(studyDayKey(cursor, config))) return 0;
  }
  let streak = 0;
  while (days.has(studyDayKey(cursor, config))) {
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
