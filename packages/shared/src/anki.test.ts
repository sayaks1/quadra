import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyRating,
  createInitialAnki,
  formatReviewIntervalDays,
  isDue,
  previewIntervalLabel,
  previewIntervals,
  reviewDueAt,
  startOfStudyDay,
} from "./anki";
import { DEFAULT_ANKI_CONFIG, type Card } from "./types";

function card(partial: Partial<Card["anki"]> & { id?: string } = {}): Card {
  const now = new Date("2026-10-05T12:00:00.000Z");
  return {
    id: partial.id ?? "card_test",
    deckId: "deck_test",
    term: "테스트",
    reading: "",
    meaning: "test",
    notes: "",
    imageKey: null,
    audioKey: null,
    audioSource: "none",
    anki: { ...createInitialAnki(now), ...partial },
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    deletedAt: null,
  };
}

function daysUntil(from: Date, iso: string) {
  return Math.round((new Date(iso).getTime() - from.getTime()) / 86400_000);
}

describe("learning Easy interval cap", () => {
  const now = new Date("2026-10-05T12:00:00.000Z");

  it("allows 4d Easy on a fresh learning card", () => {
    const c = card({ phase: "learning", learningStep: 0, reps: 0, lapses: 0 });
    const next = applyRating(c, "easy", now, DEFAULT_ANKI_CONFIG);
    assert.equal(next.anki.intervalDays, 4);
    assert.equal(daysUntil(now, next.anki.due), 4);
  });

  it("caps Easy at 2d after many learning reps", () => {
    const c = card({ phase: "learning", learningStep: 0, reps: 6, lapses: 0 });
    const next = applyRating(c, "easy", now, DEFAULT_ANKI_CONFIG);
    assert.equal(next.anki.intervalDays, 2);
    assert.equal(daysUntil(now, next.anki.due), 2);
  });

  it("caps Easy at 2d while relearning after a lapse", () => {
    const c = card({
      phase: "relearning",
      learningStep: 0,
      reps: 12,
      lapses: 2,
      intervalDays: 30,
    });
    const preview = previewIntervals(c, now, DEFAULT_ANKI_CONFIG);
    assert.equal(daysUntil(now, preview.easy), 2);
  });
});

describe("Anki study-day boundary", () => {
  const config = { ...DEFAULT_ANKI_CONFIG, dayStartsAtHour: 4 };

  it("schedules review dues at the start of a study day, not the clock time", () => {
    const now = new Date("2026-10-08T19:05:00.000Z"); // afternoon-ish UTC
    const due = reviewDueAt(now, 1, config);
    const start = startOfStudyDay(now, config);
    assert.equal(due.getHours(), 4);
    assert.equal(due.getMinutes(), 0);
    assert.equal(
      due.getTime(),
      new Date(start.getTime() + 86400_000).getTime(),
    );
  });

  it("makes same-calendar-day review dues available from day start", () => {
    // Card due at noon local — should already be due at 9am the same study day.
    const morning = new Date();
    morning.setHours(9, 0, 0, 0);
    const noonDue = new Date(morning);
    noonDue.setHours(12, 5, 0, 0);
    const c = card({
      phase: "review",
      reps: 5,
      intervalDays: 11,
      due: noonDue.toISOString(),
    });
    assert.equal(isDue(c, morning, config), true);
  });

  it("does not treat tomorrow's review as due this evening", () => {
    const evening = new Date();
    evening.setHours(21, 0, 0, 0);
    const tomorrow = startOfStudyDay(evening, config);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const c = card({
      phase: "review",
      reps: 5,
      intervalDays: 1,
      due: tomorrow.toISOString(),
    });
    assert.equal(isDue(c, evening, config), false);
  });

  it("keeps learning steps minute-accurate", () => {
    const now = new Date("2026-10-08T15:00:00.000Z");
    const c = card({
      phase: "learning",
      learningStep: 0,
      reps: 1,
      due: new Date(now.getTime() + 60_000).toISOString(),
    });
    assert.equal(isDue(c, now, config), false);
    assert.equal(isDue(c, now, config, { learnAhead: true }), true);
    assert.equal(
      isDue(c, new Date(now.getTime() + 60_000), config),
      true,
    );
  });

  it("shows review ratings as whole days, not leftover hours to 4am", () => {
    // Late evening — next review lands at study-day 4am (~5h away), but Anki shows Nd.
    const now = new Date();
    now.setHours(23, 0, 0, 0);
    const c = card({
      phase: "review",
      reps: 5,
      intervalDays: 1,
      ease: 2.5,
      due: now.toISOString(),
    });
    assert.equal(previewIntervalLabel(c, "good", now, config), "3d"); // round(1 * 2.5)
    assert.match(previewIntervalLabel(c, "easy", now, config), /^\d+d$/);
    assert.equal(previewIntervalLabel(c, "again", now, config), "10m");
  });
});
