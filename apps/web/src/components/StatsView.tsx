"use client";

import { useMemo } from "react";
import {
  answeredToday,
  cardsForDeck,
  deckStats,
  recallPercent,
  studyStreakDays,
} from "@quadra/shared";
import { DeckPageHeader } from "@/components/DeckPageHeader";
import { useQuadra } from "@/lib/store";

export function StatsView({ deckId }: { deckId: string }) {
  const decks = useQuadra((s) => s.decks);
  const cards = useQuadra((s) => s.cards);
  const reviews = useQuadra((s) => s.reviews);
  const anki = useQuadra((s) => s.settings.anki);
  const deck = decks.find((d) => d.id === deckId);
  const list = cardsForDeck(cards, deckId);
  const stats = deckStats(cards, deckId, new Date(), anki, reviews);
  const cardIds = useMemo(() => new Set(list.map((c) => c.id)), [list]);
  const deckReviews = useMemo(
    () => reviews.filter((r) => cardIds.has(r.cardId)),
    [reviews, cardIds],
  );
  const answered = answeredToday(deckReviews);
  const recall = recallPercent(deckReviews);
  const streak = studyStreakDays(deckReviews);

  const fortnight = useMemo(() => {
    const days = Array.from({ length: 14 }, (_, i) => i);
    return days.map((offset) => {
      const day = new Date();
      day.setHours(0, 0, 0, 0);
      day.setDate(day.getDate() + offset);
      const next = new Date(day);
      next.setDate(next.getDate() + 1);
      const count = list.filter((c) => {
        const due = new Date(c.anki.due);
        return due >= day && due < next;
      }).length;
      return { offset, count };
    });
  }, [list]);

  const heatmap = useMemo(() => activityHeatmap(deckReviews, 20 * 7), [deckReviews]);

  const maxBar = Math.max(1, ...fortnight.map((d) => d.count));
  const young = list.filter(
    (c) => c.anki.phase === "review" && c.anki.intervalDays < 21,
  ).length;

  function exportDeck() {
    if (!deck) return;
    const payload = {
      name: deck.name,
      language: deck.language,
      exportedAt: new Date().toISOString(),
      cards: list.map((c) => ({
        term: c.term,
        reading: c.reading,
        meaning: c.meaning,
        notes: c.notes,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${deck.name.replace(/\s+/g, "-").toLowerCase()}-quadra.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!deck) return null;

  return (
    <div className="flex h-full flex-col p-5 md:p-8">
      <DeckPageHeader
        deckId={deckId}
        title={deck.name}
        tab="stats"
        secondaryLabel="Export"
        onSecondary={exportDeck}
      />

      <div className="grid grid-cols-4 gap-3">
        <Metric value={`${answered}`} label="answered today" />
        <Metric value={`${streak}`} label="day streak" />
        <Metric value={`${recall}%`} label="recall on reviews" />
        <Metric value={`${stats.mature}`} label="mature cards" />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-[20px] bg-card p-5 shadow-sm">
          <h3 className="text-[14.5px] font-medium">Coming up</h3>
          <p className="mb-4 text-[12px] text-stone">Reviews over the next fortnight</p>
          <div className="flex h-36 items-end gap-1.5">
            {fortnight.map((d) => (
              <div key={d.offset} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t-md"
                  style={{
                    height: `${Math.max(4, (d.count / maxBar) * 100)}%`,
                    background: d.offset === 0 ? "var(--oxblood)" : "var(--stone)",
                    opacity: d.offset === 0 ? 1 : 0.45,
                  }}
                />
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-stone">
            <span>today</span>
            <span>+14d</span>
          </div>
        </div>

        <div className="rounded-[20px] bg-card p-5 shadow-sm">
          <h3 className="text-[14.5px] font-medium">Twenty weeks of study</h3>
          <p className="mb-4 text-[12px] text-stone">
            {deckReviews.length
              ? "Days you studied this deck in Quadra"
              : "Empty until you review cards here — Anki history isn’t imported"}
          </p>
          <div
            className="grid gap-1"
            style={{ gridTemplateColumns: "repeat(20, minmax(0, 1fr))" }}
            title="Each cell is one day; darker = more reviews"
          >
            {heatmap.map((cell) => (
              <div
                key={cell.key}
                className="aspect-square rounded-[3px]"
                style={{ background: cell.color }}
                title={`${cell.label}: ${cell.count} review${cell.count === 1 ? "" : "s"}`}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-[20px] bg-card p-5 shadow-sm">
        <h3 className="text-[14.5px] font-medium">Deck makeup</h3>
        <p className="mb-3 text-[12px] text-stone">{stats.total} cards</p>
        <div className="flex h-3 overflow-hidden rounded-full">
          <Seg flex={stats.neu} color="#d9d7d0" />
          <Seg flex={stats.learning} color="#6e2f2f" />
          <Seg flex={young} color="#b07a7a" />
          <Seg flex={stats.mature} color="#4a2a2a" />
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-[12px] text-stone">
          <span>New {stats.neu}</span>
          <span>Learning {stats.learning}</span>
          <span>Young {young}</span>
          <span>Mature {stats.mature}</span>
        </div>
      </div>
    </div>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-[20px] bg-card px-5 py-4 shadow-sm">
      <div className="font-serif text-[40px] leading-none">{value}</div>
      <div className="mt-2 text-[12px] text-stone">{label}</div>
    </div>
  );
}

function Seg({ flex, color }: { flex: number; color: string }) {
  if (flex <= 0) return null;
  return <div style={{ flex, background: color }} />;
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

const HEAT = ["#ecece8", "#d4c4c4", "#b07a7a", "#8a4a4a", "#6e2f2f"] as const;

/** Oldest → newest daily cells for the last N days, from real review logs. */
function activityHeatmap(reviews: { reviewedAt: string }[], cells: number, now = new Date()) {
  const counts = new Map<string, number>();
  for (const r of reviews) {
    const d = new Date(r.reviewedAt);
    d.setHours(0, 0, 0, 0);
    const k = dayKey(d);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const end = new Date(now);
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - (cells - 1));

  const max = Math.max(1, ...counts.values());
  return Array.from({ length: cells }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const count = counts.get(dayKey(d)) ?? 0;
    const level =
      count === 0 ? 0 : Math.min(4, Math.ceil((count / max) * 4) || 1);
    return {
      key: `${dayKey(d)}-${i}`,
      count,
      color: HEAT[level]!,
      label: d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
    };
  });
}
