"use client";

import { useEffect, useState } from "react";
import {
  activeDecks,
  deckStats,
  dueCards,
  type Deck,
  type Card,
} from "@quadra/shared";
import { AddDeckModal } from "@/components/AddDeckModal";
import { QuadraMark } from "@/components/ui";
import { useQuadra } from "@/lib/store";
import { cn } from "@/lib/cn";

export function Sidebar({
  mobileOpen = false,
  onMobileClose,
}: {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}) {
  const route = useQuadra((s) => s.route);

  useEffect(() => {
    onMobileClose?.();
    // Close drawer whenever the route changes (mobile nav tap)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally route-driven
  }, [route]);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden h-full w-[240px] shrink-0 flex-col px-4 py-5 md:flex">
        <SidebarNav onNavigate={onMobileClose} />
      </aside>

      {/* Mobile drawer */}
      <div
        className={cn(
          "fixed inset-0 z-40 md:hidden",
          mobileOpen ? "pointer-events-auto" : "pointer-events-none",
        )}
      >
        <button
          type="button"
          aria-label="Close menu"
          className={cn(
            "absolute inset-0 bg-ink/30 transition-opacity",
            mobileOpen ? "opacity-100" : "opacity-0",
          )}
          onClick={onMobileClose}
        />
        <aside
          className={cn(
            "absolute inset-y-0 left-0 flex w-[min(280px,86vw)] flex-col bg-field px-4 py-5 pt-[max(1.25rem,env(safe-area-inset-top))] shadow-xl transition-transform",
            mobileOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <SidebarNav onNavigate={onMobileClose} />
        </aside>
      </div>
    </>
  );
}

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const decksRaw = useQuadra((s) => s.decks);
  const cards = useQuadra((s) => s.cards);
  const route = useQuadra((s) => s.route);
  const setRoute = useQuadra((s) => s.setRoute);
  const syncStatus = useQuadra((s) => s.syncStatus);
  const syncBackend = useQuadra((s) => s.syncBackend);
  const decks = activeDecks(decksRaw);
  const [addingDeck, setAddingDeck] = useState(false);

  const selectedDeckId = route.name === "deck" || route.name === "study" ? route.deckId : undefined;
  const settingsActive = route.name === "settings";

  function go(next: Parameters<typeof setRoute>[0]) {
    setRoute(next);
    onNavigate?.();
  }

  return (
    <>
      <button
        type="button"
        className="mb-8 flex items-center gap-2 text-left"
        onClick={() => go({ name: "today" })}
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
          className="rounded-full px-2 py-0.5 text-[12px] font-medium text-oxblood transition hover:bg-card"
          aria-label="New deck"
          onClick={() => setAddingDeck(true)}
        >
          + New
        </button>
      </div>
      {addingDeck ? <AddDeckModal onClose={() => setAddingDeck(false)} /> : null}

      <nav className="flex flex-1 flex-col gap-1 overflow-auto">
        <NavRow
          active={route.name === "today"}
          label="Today"
          onClick={() => go({ name: "today" })}
        />
        <NavRow
          active={route.name === "search"}
          label="Search"
          onClick={() => go({ name: "search", query: "", addedToday: false })}
        />
        <div className="my-2 h-px bg-stone/30" />
        {decks.map((deck: Deck) => {
          const stats = deckStats(cards as Card[], deck.id);
          return (
            <NavRow
              key={deck.id}
              active={selectedDeckId === deck.id}
              label={deck.name}
              count={stats.due || undefined}
              onClick={() => go({ name: "deck", deckId: deck.id, tab: "cards" })}
            />
          );
        })}
      </nav>

      <div className="mt-auto flex items-center justify-between gap-2 px-2 pt-4 text-[12px] text-stone">
        <button
          type="button"
          className={cn("hover:text-ink", settingsActive && "text-ink font-medium")}
          onClick={() => go({ name: "settings" })}
        >
          Settings
        </button>
        <span className="w-14 shrink-0 text-right capitalize tabular-nums">
          {syncBackend === "supabase"
            ? syncStatus === "synced"
              ? "Cloud"
              : syncStatus === "syncing"
                ? "Sync"
                : syncStatus
            : syncStatus === "local"
              ? "Local"
              : syncStatus}
        </span>
      </div>
    </>
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
        "flex w-full items-center justify-between rounded-[14px] px-3 py-2.5 text-left text-[14.5px] font-medium transition-colors",
        active ? "bg-card text-ink" : "text-ink/80 hover:bg-card/60",
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
