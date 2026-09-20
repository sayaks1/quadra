"use client";

import { useEffect, useState } from "react";
import type { Card } from "@quadra/shared";
import { AddFlowModal } from "@/components/AddFlowModal";
import { CardsView } from "@/components/CardsView";
import { EditCardModal } from "@/components/EditCardModal";
import { Sidebar } from "@/components/Sidebar";
import { StatsView } from "@/components/StatsView";
import { StudyView } from "@/components/StudyView";
import { TodayView } from "@/components/TodayView";
import { useQuadra } from "@/lib/store";
import { Segmented } from "@/components/CardsView";

export function AppShell() {
  const hydrated = useQuadra((s) => s.hydrated);
  const route = useQuadra((s) => s.route);
  const setRoute = useQuadra((s) => s.setRoute);
  const setHydrated = useQuadra((s) => s.setHydrated);
  const [editing, setEditing] = useState<Card | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    // zustand persist may already have hydrated
    if (!hydrated) {
      const t = window.setTimeout(() => setHydrated(true), 50);
      return () => window.clearTimeout(t);
    }
  }, [hydrated, setHydrated]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && route.name === "study") {
        setRoute({ name: "today" });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [route.name, setRoute]);

  useEffect(() => {
    if (!hydrated) return;
    let timer: number | undefined;
    const unsub = useQuadra.subscribe((state, prev) => {
      if (
        state.decks === prev.decks &&
        state.cards === prev.cards &&
        state.reviews === prev.reviews
      ) {
        return;
      }
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const payload = {
          decks: state.decks,
          cards: state.cards,
          reviews: state.reviews,
          version: state.version,
        };
        useQuadra.setState({ syncStatus: "syncing" });
        void fetch("/api/store", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
          .then(() => useQuadra.setState({ syncStatus: "synced" }))
          .catch(() => useQuadra.setState({ syncStatus: "offline" }));
      }, 500);
    });
    return () => {
      window.clearTimeout(timer);
      unsub();
    };
  }, [hydrated]);

  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-field text-stone">
        Loading Quadra…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-field p-4 md:p-6">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-[1280px] overflow-hidden rounded-[26px] bg-field shadow-sm md:min-h-[calc(100vh-3rem)]">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-auto rounded-[26px] bg-[#f3f3f0]">
          {route.name === "today" ? (
            <TodayView onOpenAdd={() => setAdding(true)} />
          ) : null}
          {route.name === "added-today" ? (
            <CardsView
              addedTodayOnly
              onEdit={setEditing}
              onOpenAdd={() => setAdding(true)}
            />
          ) : null}
          {route.name === "search" ? (
            <CardsView
              global
              initialQuery={route.query ?? ""}
              onEdit={setEditing}
              onOpenAdd={() => setAdding(true)}
            />
          ) : null}
          {route.name === "study" ? <StudyView deckId={route.deckId} /> : null}
          {route.name === "deck" && route.tab === "cards" ? (
            <DeckCards
              deckId={route.deckId}
              onEdit={setEditing}
              onOpenAdd={() => setAdding(true)}
            />
          ) : null}
          {route.name === "deck" && route.tab === "stats" ? (
            <StatsView deckId={route.deckId} onOpenAdd={() => setAdding(true)} />
          ) : null}
          {route.name === "deck" && route.tab === "study" ? (
            <StudyView deckId={route.deckId} />
          ) : null}
        </main>
      </div>
      <EditCardModal card={editing} onClose={() => setEditing(null)} />
      {adding ? <AddFlowModal onClose={() => setAdding(false)} /> : null}
    </div>
  );
}

function DeckCards({
  deckId,
  onEdit,
  onOpenAdd,
}: {
  deckId: string;
  onEdit: (c: Card) => void;
  onOpenAdd: () => void;
}) {
  const setRoute = useQuadra((s) => s.setRoute);
  return (
    <div className="relative h-full">
      <CardsView deckId={deckId} onEdit={onEdit} onOpenAdd={onOpenAdd} />
      {/* Ensure segment study navigates to study route */}
      <div className="pointer-events-none absolute right-[9.5rem] top-8 hidden">
        <Segmented
          value="cards"
          onChange={(tab) => {
            if (tab === "study") setRoute({ name: "study", deckId });
            else setRoute({ name: "deck", deckId, tab });
          }}
        />
      </div>
    </div>
  );
}
