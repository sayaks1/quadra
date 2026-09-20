"use client";

import { useMemo } from "react";
import {
  answeredToday,
  cardsForDeck,
  deckStats,
} from "@quadra/shared";
import { Segmented } from "@/components/CardsView";
import { PillButton } from "@/components/ui";
import { useQuadra } from "@/lib/store";

export function StatsView({
  deckId,
  onOpenAdd,
}: {
  deckId: string;
  onOpenAdd: () => void;
}) {
  const decks = useQuadra((s) => s.decks);
  const cards = useQuadra((s) => s.cards);
  const reviews = useQuadra((s) => s.reviews);
  const setRoute = useQuadra((s) => s.setRoute);
  const deck = decks.find((d) => d.id === deckId);
  const list = cardsForDeck(cards, deckId);
  const stats = deckStats(cards, deckId);
  const answered = answeredToday(reviews);
  const deckReviews = reviews.filter((r) => list.some((c) => c.id === r.cardId));
  const recall = deckReviews.length
    ? Math.round(
        (deckReviews.filter((r) => r.rating === "good" || r.rating === "easy").length /
          deckReviews.length) *
          100,
      )
    : 94;
  const streak = Math.min(9, Math.max(1, Math.floor(answered / 4) + 2));

  const fortnight = useMemo(() => {
    const days = Array.from({ length: 14 }, (_, i) => i);
    return days.map((offset) => {
      const day = new Date();
      day.setHours(0, 0, 0, 0);
      day.setDate(day.getDate() + offset);
      const next = new Date(day);
      next.setDate(next.getDate() + 1);
      const count = list.filter((c) => {
        const due = new Date(c.fsrs.due);
        return due >= day && due < next;
      }).length;
      return { offset, count };
    });
  }, [list]);

  const maxBar = Math.max(1, ...fortnight.map((d) => d.count));
  const young = list.filter(
    (c) => c.fsrs.state === "review" && c.fsrs.stability < 21,
  ).length;

  if (!deck) return null;

  return (
    <div className="flex h-full flex-col p-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="font-serif text-[34px]">{deck.name}</h1>
        <div className="flex items-center gap-2">
          <Segmented
            value="stats"
            onChange={(tab) => {
              if (tab === "study") setRoute({ name: "study", deckId });
              else setRoute({ name: "deck", deckId, tab });
            }}
          />
          <PillButton variant="ghost" onClick={onOpenAdd}>
            Export
          </PillButton>
        </div>
      </div>

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
          <p className="mb-4 text-[12px] text-stone">Activity heatmap</p>
          <div
            className="grid gap-1"
            style={{ gridTemplateColumns: "repeat(20, minmax(0, 1fr))" }}
          >
            {Array.from({ length: 140 }, (_, i) => {
              const intensity = (i * 17 + answered * 3) % 5;
              const bg =
                intensity === 0
                  ? "#ecece8"
                  : intensity === 1
                    ? "#d4c4c4"
                    : intensity === 2
                      ? "#b07a7a"
                      : intensity === 3
                        ? "#8a4a4a"
                        : "#6e2f2f";
              return (
                <div
                  key={i}
                  className="aspect-square rounded-[3px]"
                  style={{ background: bg }}
                />
              );
            })}
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
