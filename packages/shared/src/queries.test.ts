import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createInitialAnki } from "./anki";
import {
  distributeNewAmongReviews,
  dueCards,
  insertLearningIntoQueue,
  newCardsIntroducedToday,
  orderStudyQueue,
} from "./queries";
import { DEFAULT_ANKI_CONFIG, type Card, type ReviewLog } from "./types";

function makeCard(
  id: string,
  createdAt: string,
  ankiPartial: Partial<Card["anki"]> = {},
): Card {
  const now = new Date(createdAt);
  return {
    id,
    deckId: "deck_test",
    term: id,
    reading: "",
    meaning: id,
    notes: "",
    imageKey: null,
    audioKey: null,
    audioSource: "none",
    anki: { ...createInitialAnki(now), ...ankiPartial },
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
  };
}

describe("new cards per day", () => {
  const now = new Date("2026-10-07T15:00:00.000Z");
  const config = { ...DEFAULT_ANKI_CONFIG, newCardsPerDay: 20 };

  it("caps unseen new cards at newCardsPerDay", () => {
    const cards = Array.from({ length: 40 }, (_, i) =>
      makeCard(
        `card_${i}`,
        new Date(Date.UTC(2026, 9, 7, 4, 0, i)).toISOString(),
      ),
    );
    const due = dueCards(cards, now, undefined, config, []);
    assert.equal(due.length, 20);
    assert.deepEqual(
      due.map((c) => c.id),
      cards.slice(0, 20).map((c) => c.id),
    );
  });

  it("does not open more new cards after 20 introductions the same day", () => {
    const cards = Array.from({ length: 40 }, (_, i) =>
      makeCard(
        `card_${i}`,
        new Date(Date.UTC(2026, 9, 7, 4, 0, i)).toISOString(),
      ),
    );
    // First 20 already answered once today → introduced; they are now learning.
    for (let i = 0; i < 20; i++) {
      cards[i] = {
        ...cards[i],
        anki: {
          ...cards[i].anki,
          phase: "learning",
          reps: 1,
          due: new Date(now.getTime() + 60_000).toISOString(),
        },
      };
    }
    const reviews: ReviewLog[] = Array.from({ length: 20 }, (_, i) => ({
      id: `rev_${i}`,
      cardId: `card_${i}`,
      rating: "good",
      reviewedAt: new Date(Date.UTC(2026, 9, 7, 14, 0, i)).toISOString(),
      scheduledDays: 0,
    }));
    assert.equal(newCardsIntroducedToday(reviews, now, undefined, cards), 20);
    const due = dueCards(cards, now, undefined, config, reviews);
    // Learning cards may still be learn-ahead due, but no additional unseen new.
    assert.equal(due.filter((c) => c.anki.phase === "new").length, 0);
  });

  it("keeps tomorrow capped at 20 even if only 5 were learned yesterday", () => {
    const cards = Array.from({ length: 40 }, (_, i) =>
      makeCard(
        `card_${i}`,
        new Date(Date.UTC(2026, 9, 6, 4, 0, i)).toISOString(),
      ),
    );
    // 5 learned yesterday (now review); 35 still new.
    for (let i = 0; i < 5; i++) {
      cards[i] = {
        ...cards[i],
        anki: {
          ...cards[i].anki,
          phase: "review",
          reps: 1,
          intervalDays: 1,
          due: new Date(Date.UTC(2026, 9, 8)).toISOString(),
        },
      };
    }
    const reviews: ReviewLog[] = Array.from({ length: 5 }, (_, i) => ({
      id: `rev_${i}`,
      cardId: `card_${i}`,
      rating: "good",
      reviewedAt: new Date(Date.UTC(2026, 9, 6, 18, 0, i)).toISOString(),
      scheduledDays: 1,
    }));
    const tomorrow = new Date("2026-10-07T15:00:00.000Z");
    const due = dueCards(cards, tomorrow, undefined, config, reviews);
    assert.equal(due.filter((c) => c.anki.phase === "new").length, 20);
    assert.equal(due.length, 20);
  });

  it("still includes due review cards beyond the new-card cap", () => {
    const reviewsDue = makeCard("review_1", "2026-09-01T00:00:00.000Z", {
      phase: "review",
      reps: 3,
      intervalDays: 3,
      due: "2026-10-07T10:00:00.000Z",
    });
    const news = Array.from({ length: 25 }, (_, i) =>
      makeCard(
        `new_${i}`,
        new Date(Date.UTC(2026, 9, 7, 4, 0, i)).toISOString(),
      ),
    );
    const due = dueCards([reviewsDue, ...news], now, undefined, config, []);
    assert.equal(due.filter((c) => c.id === "review_1").length, 1);
    assert.equal(due.filter((c) => c.anki.phase === "new").length, 20);
    assert.equal(due.length, 21);
  });

  it("does not treat Anki-imported review cards as new introductions", () => {
    // Mature imported card: high reps, but first Quadra review is today.
    const imported = makeCard("import_1", "2026-09-01T00:00:00.000Z", {
      phase: "review",
      reps: 27,
      intervalDays: 30,
      due: "2026-10-07T10:00:00.000Z",
    });
    const news = Array.from({ length: 25 }, (_, i) =>
      makeCard(
        `new_${i}`,
        new Date(Date.UTC(2026, 9, 7, 4, 0, i)).toISOString(),
      ),
    );
    const reviews: ReviewLog[] = [
      {
        id: "rev_import",
        cardId: "import_1",
        rating: "good",
        reviewedAt: new Date(Date.UTC(2026, 9, 7, 14, 0, 0)).toISOString(),
        scheduledDays: 30,
      },
    ];
    assert.equal(
      newCardsIntroducedToday(reviews, now, undefined, [imported, ...news]),
      0,
    );
    const due = dueCards([imported, ...news], now, undefined, config, reviews);
    assert.equal(due.filter((c) => c.anki.phase === "new").length, 20);
  });

  it("counts explicit newIntro flags toward the daily budget", () => {
    const news = Array.from({ length: 25 }, (_, i) =>
      makeCard(
        `new_${i}`,
        new Date(Date.UTC(2026, 9, 7, 4, 0, i)).toISOString(),
      ),
    );
    for (let i = 0; i < 20; i++) {
      news[i] = {
        ...news[i],
        anki: {
          ...news[i].anki,
          phase: "learning",
          reps: 1,
          due: new Date(now.getTime() + 60_000).toISOString(),
        },
      };
    }
    const reviews: ReviewLog[] = Array.from({ length: 20 }, (_, i) => ({
      id: `rev_${i}`,
      cardId: `new_${i}`,
      rating: "good",
      reviewedAt: new Date(Date.UTC(2026, 9, 7, 14, 0, i)).toISOString(),
      scheduledDays: 0,
      newIntro: true,
    }));
    assert.equal(newCardsIntroducedToday(reviews, now, undefined, news), 20);
    const due = dueCards(news, now, undefined, config, reviews);
    assert.equal(due.filter((c) => c.anki.phase === "new").length, 0);
  });

  it("applies the new-card cap per deck, not globally", () => {
    const zhNews = Array.from({ length: 10 }, (_, i) => {
      const c = makeCard(
        `zh_${i}`,
        new Date(Date.UTC(2026, 9, 7, 3, 0, i)).toISOString(),
      );
      return { ...c, deckId: "deck_zh" };
    });
    // 5 Chinese cards already introduced today
    for (let i = 0; i < 5; i++) {
      zhNews[i] = {
        ...zhNews[i],
        anki: {
          ...zhNews[i].anki,
          phase: "learning",
          reps: 1,
          due: new Date(now.getTime() + 60_000).toISOString(),
        },
      };
    }
    const jaNews = Array.from({ length: 30 }, (_, i) => {
      const c = makeCard(
        `ja_${i}`,
        new Date(Date.UTC(2026, 9, 7, 4, 0, i)).toISOString(),
      );
      return { ...c, deckId: "deck_ja" };
    });
    const reviews: ReviewLog[] = Array.from({ length: 5 }, (_, i) => ({
      id: `rev_zh_${i}`,
      cardId: `zh_${i}`,
      rating: "good",
      reviewedAt: new Date(Date.UTC(2026, 9, 7, 14, 0, i)).toISOString(),
      scheduledDays: 0,
    }));

    const jaDue = dueCards(jaNews, now, "deck_ja", config, reviews);
    assert.equal(jaDue.filter((c) => c.anki.phase === "new").length, 20);

    const allDue = dueCards([...zhNews, ...jaNews], now, undefined, config, reviews);
    assert.equal(
      allDue.filter((c) => c.deckId === "deck_ja" && c.anki.phase === "new").length,
      20,
    );
    assert.equal(
      allDue.filter((c) => c.deckId === "deck_zh" && c.anki.phase === "new").length,
      5,
    );
  });
});

describe("Anki-like new/review interleaving", () => {
  const now = new Date("2026-10-07T15:00:00.000Z");

  it("spreads new cards through reviews instead of dumping them first", () => {
    const reviews = Array.from({ length: 10 }, (_, i) =>
      makeCard(`rev_${i}`, "2026-09-01T00:00:00.000Z", {
        phase: "review",
        reps: 3,
        intervalDays: 3,
        due: new Date(Date.UTC(2026, 9, 7, 10, 0, i)).toISOString(),
      }),
    );
    const news = Array.from({ length: 5 }, (_, i) =>
      makeCard(
        `new_${i}`,
        new Date(Date.UTC(2026, 9, 7, 4, 0, i)).toISOString(),
      ),
    );
    const due = dueCards([...reviews, ...news], now, undefined, DEFAULT_ANKI_CONFIG, []);
    assert.equal(due.length, 15);
    // Must not open with every new card before any review.
    const firstFive = due.slice(0, 5).map((c) => c.anki.phase);
    assert.ok(firstFive.includes("review"), `expected a review early, got ${firstFive}`);
    assert.ok(
      firstFive.some((p) => p === "new"),
      "expected at least one new card mixed into the early queue",
    );
    // New cards should appear at multiple positions, not a single block at index 0.
    const newIndexes = due
      .map((c, i) => (c.anki.phase === "new" ? i : -1))
      .filter((i) => i >= 0);
    assert.equal(newIndexes.length, 5);
    assert.ok(newIndexes[0]! > 0 || newIndexes[4]! < due.length - 1);
    assert.ok(
      newIndexes[4]! - newIndexes[0]! >= 4,
      `new cards should be spread, indexes=${newIndexes}`,
    );
  });

  it("shows due learning cards before unseen new cards", () => {
    const learning = makeCard("learn_1", "2026-09-01T00:00:00.000Z", {
      phase: "learning",
      reps: 1,
      learningStep: 0,
      due: "2026-10-07T14:59:00.000Z",
    });
    const news = Array.from({ length: 5 }, (_, i) =>
      makeCard(
        `new_${i}`,
        new Date(Date.UTC(2026, 9, 7, 4, 0, i)).toISOString(),
      ),
    );
    const due = orderStudyQueue([learning, ...news], now);
    assert.equal(due[0]?.id, "learn_1");
  });

  it("parks a just-answered learning card mid-queue, not behind every new card", () => {
    const news = Array.from({ length: 12 }, (_, i) =>
      makeCard(
        `new_${i}`,
        new Date(Date.UTC(2026, 9, 7, 4, 0, i)).toISOString(),
      ),
    );
    const learning = makeCard("learn_1", "2026-09-01T00:00:00.000Z", {
      phase: "learning",
      reps: 1,
      learningStep: 0,
      // 1 minute step — ~4 cards ahead at 15s/card
      due: new Date(now.getTime() + 60_000).toISOString(),
    });
    const queued = insertLearningIntoQueue(news, learning, now);
    const idx = queued.findIndex((c) => c.id === "learn_1");
    assert.ok(idx >= 1, "should not be immediate next when step is in the future");
    assert.ok(idx <= 6, `should return around the 1m mark, got index ${idx}`);
    assert.ok(idx < news.length, "must not be buried after every new card");
  });

  it("uses the same interleave math for any language/deck mix", () => {
    const reviews = Array.from({ length: 6 }, (_, i) => {
      const c = makeCard(`rev_${i}`, "2026-09-01T00:00:00.000Z", {
        phase: "review",
        reps: 2,
        intervalDays: 2,
        due: new Date(Date.UTC(2026, 9, 7, 10, 0, i)).toISOString(),
      });
      return { ...c, deckId: i % 2 === 0 ? "deck_ja" : "deck_ko" };
    });
    const news = Array.from({ length: 3 }, (_, i) => {
      const c = makeCard(
        `new_${i}`,
        new Date(Date.UTC(2026, 9, 7, 4, 0, i)).toISOString(),
      );
      return { ...c, deckId: i % 2 === 0 ? "deck_ja" : "deck_zh" };
    });
    const mixed = distributeNewAmongReviews(reviews, news);
    const viaOrder = orderStudyQueue([...reviews, ...news], now);
    assert.deepEqual(
      viaOrder.map((c) => c.id),
      mixed.map((c) => c.id),
    );
    // Pattern depends only on counts, not language labels on the cards.
    assert.deepEqual(
      mixed.map((c) => (c.anki.phase === "new" ? "N" : "R")).join(""),
      distributeNewAmongReviews(
        reviews.map((c) => ({ ...c, deckId: "deck_x" })),
        news.map((c) => ({ ...c, deckId: "deck_x" })),
      )
        .map((c) => (c.anki.phase === "new" ? "N" : "R"))
        .join(""),
    );
  });

  it("builds identical new/review patterns for mirrored ja/ko/zh decks", () => {
    const config = { ...DEFAULT_ANKI_CONFIG, newCardsPerDay: 20 };
    const langs = ["deck_ja", "deck_ko", "deck_zh"] as const;

    function mirroredDeck(deckId: string): Card[] {
      const reviews = Array.from({ length: 8 }, (_, i) => {
        const c = makeCard(`${deckId}_rev_${i}`, "2026-09-01T00:00:00.000Z", {
          phase: "review",
          reps: 4,
          intervalDays: 5,
          due: new Date(Date.UTC(2026, 9, 7, 9, 0, i)).toISOString(),
        });
        return { ...c, deckId };
      });
      const news = Array.from({ length: 25 }, (_, i) => {
        const c = makeCard(
          `${deckId}_new_${i}`,
          new Date(Date.UTC(2026, 9, 7, 5, 0, i)).toISOString(),
        );
        return { ...c, deckId };
      });
      const learning = makeCard(`${deckId}_learn`, "2026-09-01T00:00:00.000Z", {
        phase: "learning",
        reps: 1,
        learningStep: 0,
        due: "2026-10-07T14:58:00.000Z",
      });
      return [{ ...learning, deckId }, ...reviews, ...news];
    }

    const patterns = langs.map((deckId) => {
      const due = dueCards(mirroredDeck(deckId), now, deckId, config, []);
      return {
        length: due.length,
        newCount: due.filter((c) => c.anki.phase === "new").length,
        phases: due.map((c) => c.anki.phase).join(","),
        first: due[0]?.anki.phase,
      };
    });

    assert.equal(patterns[0]!.newCount, 20);
    assert.deepEqual(patterns[0], patterns[1]);
    assert.deepEqual(patterns[0], patterns[2]);
  });
});
