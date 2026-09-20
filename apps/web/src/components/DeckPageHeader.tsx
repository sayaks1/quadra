"use client";

import { PillButton } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useQuadra } from "@/lib/store";

/**
 * Shared deck page chrome.
 * Study leaves the page entirely, so it is a standalone CTA — not a Cards|Stats
 * tab, and not glued to the title. Add card / Export share a fixed width.
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
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <h1 className="min-w-0 font-serif text-[34px] font-normal tracking-tight">
        {title}
      </h1>
      <div className="flex flex-wrap items-center gap-2">
        <PillButton
          variant="oxblood"
          onClick={() => setRoute({ name: "study", deckId })}
        >
          Study
        </PillButton>
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
