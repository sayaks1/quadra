import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createInitialAnki } from "./anki";
import { dueCards, newCardsIntroducedToday } from "./queries";
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
    assert.equal(newCardsIntroducedToday(reviews, now), 20);
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
