"use client";

import {
  activeDecks,
  deckStats,
  dueCards,
  estimateSessionMinutes,
  answeredToday,
} from "@quadra/shared";
import { PillButton } from "@/components/ui";
import { useQuadra } from "@/lib/store";

export function TodayView({ onOpenAdd }: { onOpenAdd: () => void }) {
  const decks = useQuadra((s) => activeDecks(s.decks));
  const cards = useQuadra((s) => s.cards);
  const reviews = useQuadra((s) => s.reviews);
  const setRoute = useQuadra((s) => s.setRoute);
  const due = dueCards(cards);
  const answered = answeredToday(reviews);
  const streak = Math.min(9, Math.max(1, Math.floor(answered / 5) + 3));
  const recall = reviews.length
    ? Math.round(
        (reviews.filter((r) => r.rating === "good" || r.rating === "easy").length /
          reviews.length) *
          100,
      )
    : 94;

  return (
    <div className="flex h-full flex-col p-8">
      <div className="mb-8 flex items-start justify-between">
        <h1 className="font-serif text-[40px] font-normal tracking-tight">Today</h1>
        <div className="flex gap-2">
          <PillButton variant="ghost" onClick={onOpenAdd}>
            Add card
          </PillButton>
          <PillButton
            variant="oxblood"
            onClick={() => setRoute({ name: "study" })}
            disabled={due.length === 0}
          >
            Study
          </PillButton>
        </div>
      </div>

      <div className="mb-10 flex items-end justify-between gap-8">
        <div>
          <div className="font-serif text-[72px] leading-none">{due.length}</div>
          <p className="mt-2 text-[14.5px] text-stone">
            cards waiting across {decks.length} decks
          </p>
        </div>
        <div className="flex gap-8 text-right text-[13px] text-stone">
          <Stat label="day streak" value={`${streak}`} />
          <Stat label="recall" value={`${recall}%`} />
          <Stat label="est. session" value={`${estimateSessionMinutes(due.length)}m`} />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {decks.map((deck) => {
          const stats = deckStats(cards, deck.id);
          const nothingDue = stats.due === 0;
          return (
            <div
              key={deck.id}
              className="flex items-center gap-4 rounded-[20px] bg-card px-5 py-4 shadow-sm"
            >
              <div className="min-w-0 flex-1">
                <div className="font-serif text-[22px]">{deck.name}</div>
                <div className="mt-2 flex items-center gap-3">
                  <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-field">
                    <div
                      className="h-full rounded-full bg-oxblood"
                      style={{
                        width: `${Math.min(100, ((stats.total - stats.due) / Math.max(1, stats.total)) * 100)}%`,
                      }}
                    />
                  </div>
                  <span className="shrink-0 text-[12px] text-stone">
                    {nothingDue
                      ? "nothing due"
                      : `${stats.neu} new · ${stats.learning} learning · ${stats.due} due`}
                  </span>
                </div>
              </div>
              <PillButton
                variant={nothingDue ? "ghost" : "soft"}
                onClick={() =>
                  setRoute(
                    nothingDue
                      ? { name: "deck", deckId: deck.id, tab: "cards" }
                      : { name: "study", deckId: deck.id },
                  )
                }
              >
                {nothingDue ? "Browse" : "Study"}
              </PillButton>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-serif text-[28px] text-ink">{value}</div>
      <div>{label}</div>
    </div>
  );
}
