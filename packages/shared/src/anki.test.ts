import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyRating, createInitialAnki, previewIntervals } from "./anki";
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
