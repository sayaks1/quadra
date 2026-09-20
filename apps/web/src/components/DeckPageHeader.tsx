"use client";

import { PillButton } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useQuadra } from "@/lib/store";

/**
 * Shared deck page chrome.
 * Study is a page-level action (full view change), so it sits with the title —
 * not inside the Cards|Stats tabs. Add card / Export share a fixed width so
 * switching tabs does not shift the header.
 */
export function DeckPageHeader({
  deckId,
  title,
  tab,
  onSecondary,
  secondaryLabel,
}: {
  deckId: string;
  title: string;
  tab: "cards" | "stats";
  onSecondary: () => void;
  secondaryLabel: "Add card" | "Export";
}) {
  const setRoute = useQuadra((s) => s.setRoute);

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <h1 className="font-serif text-[34px]">{title}</h1>
        <PillButton
          variant="oxblood"
          onClick={() => setRoute({ name: "study", deckId })}
        >
          Study
        </PillButton>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <DeckTabs
          value={tab}
          onChange={(next) => setRoute({ name: "deck", deckId, tab: next })}
        />
        <PillButton
          variant="ghost"
          className="w-[7.5rem] shrink-0"
          onClick={onSecondary}
        >
          {secondaryLabel}
        </PillButton>
      </div>
    </div>
  );
}

export function DeckTabs({
  value,
  onChange,
}: {
  value: "cards" | "stats";
  onChange: (v: "cards" | "stats") => void;
}) {
  return (
    <div className="flex rounded-full bg-field p-1">
      {(["cards", "stats"] as const).map((tab) => (
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
