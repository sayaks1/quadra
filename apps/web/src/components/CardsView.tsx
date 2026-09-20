"use client";

import { useEffect, useMemo, useState } from "react";
import {
  cardStatusLabel,
  cardsAddedToday,
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
  initialQuery = "",
  initialAddedToday = false,
}: {
  deckId?: string;
  onEdit: (card: Card) => void;
  onOpenAdd: () => void;
  global?: boolean;
  initialQuery?: string;
  initialAddedToday?: boolean;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [addedToday, setAddedToday] = useState(initialAddedToday);
  const cards = useQuadra((s) => s.cards);
  const decks = useQuadra((s) => s.decks);
  const search = useQuadra((s) => s.search);
  const setRoute = useQuadra((s) => s.setRoute);

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    setAddedToday(initialAddedToday);
  }, [initialAddedToday]);

  const deck = decks.find((d) => d.id === deckId);
  const list = useMemo(() => {
    if (global) {
      let base = search(query);
      if (addedToday) {
        const todayIds = new Set(cardsAddedToday(cards).map((c) => c.id));
        base = base.filter((c) => todayIds.has(c.id));
      }
      return base;
    }
    let base = cardsForDeck(cards, deckId!);
    if (query.trim()) {
      const q = query.toLowerCase();
      base = base.filter((c) =>
        `${c.term} ${c.reading} ${c.meaning} ${c.notes}`.toLowerCase().includes(q),
      );
    }
    return base;
  }, [cards, deckId, global, addedToday, query, search]);

  const stats = deckId ? deckStats(cards, deckId) : null;

  return (
    <div className="flex h-full flex-col p-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="font-serif text-[34px]">
          {global ? "Search" : deck?.name ?? "Cards"}
        </h1>
        <div className="flex items-center gap-2">
          {!global && deckId ? (
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

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={
            global
              ? addedToday
                ? "Search cards added today"
                : "Search all flashcards"
              : `Search ${stats?.total ?? list.length} cards`
          }
          className="w-full flex-1 rounded-full bg-card px-5 py-3 text-[14.5px] outline-none ring-1 ring-stone/30 focus:ring-oxblood/40"
          autoFocus={global}
        />
        {global ? (
          <button
            type="button"
            onClick={() => {
              const next = !addedToday;
              setAddedToday(next);
              setRoute({ name: "search", query, addedToday: next });
            }}
            className={cn(
              "shrink-0 rounded-full px-4 py-2.5 text-[13px] font-medium transition",
              addedToday
                ? "bg-oxblood text-white"
                : "bg-card text-ink ring-1 ring-stone/30 hover:bg-field",
            )}
          >
            Added today
          </button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-[20px] bg-card shadow-sm">
        {list.length === 0 ? (
          <EmptyState
            title="Nothing here yet"
            body={
              addedToday
                ? "No cards match — try clearing the Added today filter or add a new card."
                : global
                  ? "Try a different search, or add a card."
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
                      <span className="hidden shrink-0 text-[12px] text-stone sm:inline">
                        {d?.name}
                      </span>
                    ) : null}
                    {global ? (
                      <span
                        className="w-[7.5rem] shrink-0 text-right text-[12px] text-stone"
                        title={new Date(card.createdAt).toLocaleString()}
                      >
                        {formatAddedAt(card.createdAt)}
                      </span>
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
        <p className="mt-3 text-[12px] text-stone">
          {list.length} card{list.length === 1 ? "" : "s"}
          {addedToday ? " added today" : ""}
        </p>
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
          onClick={() => onChange(tab)}
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

function formatAddedAt(iso: string, now = new Date()) {
  const added = new Date(iso);
  const startToday = new Date(now);
  startToday.setHours(0, 0, 0, 0);
  const startAdded = new Date(added);
  startAdded.setHours(0, 0, 0, 0);
  const dayDiff = Math.round(
    (startToday.getTime() - startAdded.getTime()) / 86400_000,
  );

  if (dayDiff <= 0) {
    return `Today ${added.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    })}`;
  }
  if (dayDiff === 1) return "Yesterday";
  if (dayDiff < 7) return `${dayDiff}d ago`;
  return added.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: added.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}
