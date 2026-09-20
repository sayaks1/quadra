"use client";

import {
  activeDecks,
  deckStats,
  dueCards,
} from "@quadra/shared";
import { QuadraMark } from "@/components/ui";
import { useQuadra } from "@/lib/store";
import { cn } from "@/lib/cn";

export function Sidebar() {
  const decksRaw = useQuadra((s) => s.decks);
  const cards = useQuadra((s) => s.cards);
  const route = useQuadra((s) => s.route);
  const setRoute = useQuadra((s) => s.setRoute);
  const syncStatus = useQuadra((s) => s.syncStatus);
  const addDeck = useQuadra((s) => s.addDeck);
  const decks = activeDecks(decksRaw);

  const selectedDeckId = route.name === "deck" || route.name === "study" ? route.deckId : undefined;
  const settingsActive = route.name === "settings";

  return (
    <aside className="flex h-full w-[240px] shrink-0 flex-col px-4 py-5">
      <button
        type="button"
        className="mb-8 flex items-center gap-2 text-left"
        onClick={() => setRoute({ name: "today" })}
      >
        <QuadraMark />
        <span className="font-serif text-[28px] font-normal tracking-tight text-ink">
          Quadra
        </span>
      </button>

      <div className="mb-2 flex items-center justify-between px-2">
        <span className="text-[12px] font-medium uppercase tracking-wide text-stone">
          Decks
        </span>
        <button
          type="button"
          className="text-stone hover:text-ink"
          aria-label="Add deck"
          onClick={() => {
            const name = window.prompt("Deck name", "New deck");
            if (!name?.trim()) return;
            const lang = window.prompt("Language code (ko/ja/zh/en/other)", "ja") || "other";
            const id = addDeck(
              name.trim(),
              (["ko", "ja", "zh", "en", "other"].includes(lang) ? lang : "other") as
                | "ko"
                | "ja"
                | "zh"
                | "en"
                | "other",
            );
            setRoute({ name: "deck", deckId: id, tab: "cards" });
          }}
        >
          +
        </button>
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-auto">
        <NavRow
          active={route.name === "today"}
          label="Today"
          onClick={() => setRoute({ name: "today" })}
        />
        <NavRow
          active={route.name === "added-today"}
          label="Added today"
          onClick={() => setRoute({ name: "added-today" })}
        />
        <NavRow
          active={route.name === "search"}
          label="Search"
          onClick={() => setRoute({ name: "search", query: "" })}
        />
        <div className="my-2 h-px bg-stone/30" />
        {decks.map((deck) => {
          const stats = deckStats(cards, deck.id);
          return (
            <NavRow
              key={deck.id}
              active={selectedDeckId === deck.id}
              label={deck.name}
              count={stats.due || undefined}
              onClick={() => setRoute({ name: "deck", deckId: deck.id, tab: "cards" })}
            />
          );
        })}
      </nav>

      <div className="mt-auto flex items-center justify-between px-2 pt-4 text-[12px] text-stone">
        <button
          type="button"
          className={cn("hover:text-ink", settingsActive && "text-ink font-medium")}
          onClick={() => setRoute({ name: "settings" })}
        >
          Settings
        </button>
        <span className="capitalize">{syncStatus === "local" ? "Local" : syncStatus}</span>
      </div>
    </aside>
  );
}

function NavRow({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between rounded-[14px] px-3 py-2.5 text-left text-[14.5px] font-medium transition",
        active ? "bg-card text-ink shadow-sm" : "text-ink/80 hover:bg-card/60",
      )}
    >
      <span className="truncate pr-2">{label}</span>
      {typeof count === "number" ? (
        <span className="text-[12px] text-oxblood">{count}</span>
      ) : null}
    </button>
  );
}

export function dueSummary(cards: ReturnType<typeof dueCards>) {
  return cards.length;
}
