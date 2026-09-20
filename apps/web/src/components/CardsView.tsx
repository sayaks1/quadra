"use client";

import { useMemo, useState } from "react";
import {
  cardStatusLabel,
  cardsForDeck,
  deckStats,
  type Card,
} from "@quadra/shared";
import { PillButton } from "@/components/ui";
import { useQuadra } from "@/lib/store";
import { cn } from "@/lib/cn";

export function CardsView({
  deckId,
  onEdit,
  onOpenAdd,
  global = false,
  addedTodayOnly = false,
  initialQuery = "",
}: {
  deckId?: string;
  onEdit: (card: Card) => void;
  onOpenAdd: () => void;
  global?: boolean;
  addedTodayOnly?: boolean;
  initialQuery?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const cards = useQuadra((s) => s.cards);
  const decks = useQuadra((s) => s.decks);
  const search = useQuadra((s) => s.search);
  const getAddedToday = useQuadra((s) => s.getAddedToday);
  const setRoute = useQuadra((s) => s.setRoute);

  const deck = decks.find((d) => d.id === deckId);
  const list = useMemo(() => {
    let base: Card[] = global
      ? search(query)
      : addedTodayOnly
        ? getAddedToday()
        : cardsForDeck(cards, deckId!);
    if (!global && query.trim()) {
      const q = query.toLowerCase();
      base = base.filter((c) =>
        `${c.term} ${c.reading} ${c.meaning} ${c.notes}`.toLowerCase().includes(q),
      );
    }
    if (global && !query.trim() && !addedTodayOnly) {
      base = search("");
    }
    return base;
  }, [cards, deckId, global, addedTodayOnly, query, search, getAddedToday]);

  const stats = deckId ? deckStats(cards, deckId) : null;

  return (
    <div className="flex h-full flex-col p-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="font-serif text-[34px]">
          {addedTodayOnly
            ? "Added today"
            : global
              ? "Search"
              : deck?.name ?? "Cards"}
        </h1>
        <div className="flex items-center gap-2">
          {!global && !addedTodayOnly && deckId ? (
            <Segmented
              value="cards"
              onChange={(tab) => {
                if (tab === "study") setRoute({ name: "study", deckId });
                else setRoute({ name: "deck", deckId, tab });
              }}
            />
          ) : null}
          <PillButton variant="oxblood" onClick={onOpenAdd}>
            Add card
          </PillButton>
        </div>
      </div>

      <div className="mb-4 flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={
            global
              ? "Search all flashcards"
              : `Search ${stats?.total ?? list.length} cards`
          }
          className="w-full rounded-full bg-card px-5 py-3 text-[14.5px] outline-none ring-1 ring-stone/30 focus:ring-oxblood/40"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-[20px] bg-card shadow-sm">
        {list.length === 0 ? (
          <EmptyState
            title="Nothing here yet"
            body={
              addedTodayOnly
                ? "Cards you create today will show up here."
                : "Add a first card and Quadra will decide when to show it to you."
            }
            actionLabel="Add a card"
            onAction={onOpenAdd}
          />
        ) : (
          <ul>
            {list.map((card) => {
              const d = decks.find((x) => x.id === card.deckId);
              const status = cardStatusLabel(card);
              const dot =
                card.anki.phase === "new" ||
                (card.anki.phase === "learning" && card.anki.reps === 0)
                  ? "empty"
                  : status === "new"
                    ? "empty"
                    : card.anki.phase === "learning" || card.anki.phase === "relearning"
                      ? "oxblood"
                      : "stone";
              return (
                <li key={card.id}>
                  <button
                    type="button"
                    onClick={() => onEdit(card)}
                    className="flex w-full items-center gap-3 border-b border-stone/20 px-5 py-4 text-left last:border-b-0 hover:bg-field/50"
                  >
                    <span
                      className={cn(
                        "h-2.5 w-2.5 shrink-0 rounded-full",
                        dot === "oxblood" && "bg-oxblood",
                        dot === "stone" && "bg-stone",
                        dot === "empty" && "border border-stone bg-transparent",
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate font-serif text-[20px]">
                      {card.term}
                      <span className="font-sans text-[14.5px] text-stone">
                        {" "}
                        — {card.meaning}
                      </span>
                    </span>
                    {global ? (
                      <span className="shrink-0 text-[12px] text-stone">{d?.name}</span>
                    ) : null}
                    <span className="w-12 shrink-0 text-right text-[12px] text-stone">
                      {status}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {stats ? (
        <p className="mt-3 text-[12px] text-stone">
          {stats.total} cards · {stats.due} due today · 0 suspended
        </p>
      ) : (
        <p className="mt-3 text-[12px] text-stone">{list.length} cards</p>
      )}
    </div>
  );
}

export function Segmented({
  value,
  onChange,
}: {
  value: "study" | "cards" | "stats";
  onChange: (v: "study" | "cards" | "stats") => void;
}) {
  return (
    <div className="flex rounded-full bg-field p-1">
      {(["study", "cards", "stats"] as const).map((tab) => (
        <button
          key={tab}
          type="button"
          onClick={() => {
            if (tab === "study") {
              // parent handles via onChange
            }
            onChange(tab);
          }}
          className={cn(
            "rounded-full px-4 py-1.5 text-[13px] font-medium capitalize",
            value === tab ? "bg-card text-ink shadow-sm" : "text-stone",
          )}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-8 py-16 text-center">
      <div className="mb-6 flex h-10 w-10 items-center justify-center rounded-full border border-dashed border-stone">
        <span className="h-2 w-2 rounded-full bg-transparent" />
      </div>
      <h2 className="font-serif text-[34px]">{title}</h2>
      <p className="mt-3 max-w-sm text-[14.5px] text-stone">{body}</p>
      <PillButton variant="oxblood" className="mt-8" onClick={onAction}>
        {actionLabel}
      </PillButton>
    </div>
  );
}
