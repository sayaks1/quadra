"use client";

import {
  activeDecks,
  deckStats,
  dueCards,
  estimateSessionMinutes,
  answeredToday,
  recallPercent,
  studyStreakDays,
} from "@quadra/shared";
import { PillButton } from "@/components/ui";
import { useQuadra } from "@/lib/store";

export function TodayView({ onOpenAdd }: { onOpenAdd: () => void }) {
  const decksRaw = useQuadra((s) => s.decks);
  const cards = useQuadra((s) => s.cards);
  const reviews = useQuadra((s) => s.reviews);
  const setRoute = useQuadra((s) => s.setRoute);
  const decks = activeDecks(decksRaw);
  const due = dueCards(cards);
  const answered = answeredToday(reviews);
  const streak = studyStreakDays(reviews);
  const recall = recallPercent(reviews);

  return (
    <div className="flex h-full flex-col p-5 md:p-8">
      <div className="mb-6 flex items-start justify-between gap-3 md:mb-8">
        <h1 className="hidden font-serif text-[40px] font-normal tracking-tight md:block">
          Today
        </h1>
        <div className="flex w-full gap-2 md:w-auto md:justify-end">
          <PillButton variant="ghost" className="flex-1 md:flex-none" onClick={onOpenAdd}>
            Add card
          </PillButton>
          <PillButton
            variant="oxblood"
            className="flex-1 md:flex-none"
            data-testid="study-all"
            onClick={() => setRoute({ name: "study" })}
            disabled={due.length === 0}
          >
            Study
          </PillButton>
        </div>
      </div>

      <div className="mb-8 flex flex-col gap-6 md:mb-10 md:flex-row md:items-end md:justify-between md:gap-8">
        <div>
          <div className="font-serif text-[56px] leading-none md:text-[72px]">{due.length}</div>
          <p className="mt-2 text-[14.5px] text-stone">
            cards waiting across {decks.length} decks
          </p>
        </div>
        <div className="flex justify-between gap-4 text-[13px] text-stone md:justify-end md:gap-8 md:text-right">
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
              className="flex flex-col gap-3 rounded-[20px] bg-card px-5 py-4 shadow-sm sm:flex-row sm:items-center sm:gap-4"
            >
              <div className="min-w-0 flex-1">
                <div className="font-serif text-[22px]">{deck.name}</div>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                  <div className="h-[3px] w-full overflow-hidden rounded-full bg-field sm:flex-1">
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
                className="w-full sm:w-auto"
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
