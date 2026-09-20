"use client";

import { useEffect, useRef, useState } from "react";
import type { Card } from "@quadra/shared";
import { AddFlowModal } from "@/components/AddFlowModal";
import { CardsView } from "@/components/CardsView";
import { EditCardModal } from "@/components/EditCardModal";
import { Sidebar } from "@/components/Sidebar";
import { StatsView } from "@/components/StatsView";
import { StudyView } from "@/components/StudyView";
import { TodayView } from "@/components/TodayView";
import { SettingsView } from "@/components/SettingsView";
import { useQuadra } from "@/lib/store";

export function AppShell() {
  const route = useQuadra((s) => s.route);
  const setRoute = useQuadra((s) => s.setRoute);
  const [editing, setEditing] = useState<Card | null>(null);
  const [adding, setAdding] = useState(false);
  const syncTimer = useRef<number | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable)
      ) {
        return;
      }
      if (e.key === "Escape") {
        if (route.name === "study") setRoute({ name: "today" });
        else if (route.name === "settings") setRoute({ name: "today" });
      }
      // Start study from Today / deck home
      if (
        (e.key === "s" || e.key === "S") &&
        (route.name === "today" || (route.name === "deck" && route.tab !== "study"))
      ) {
        e.preventDefault();
        if (route.name === "deck") setRoute({ name: "study", deckId: route.deckId });
        else setRoute({ name: "study" });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [route, setRoute]);

  useEffect(() => {
    const unsub = useQuadra.subscribe((state, prev) => {
      if (
        state.decks === prev.decks &&
        state.cards === prev.cards &&
        state.reviews === prev.reviews
      ) {
        return;
      }
      if (syncTimer.current) window.clearTimeout(syncTimer.current);
      syncTimer.current = window.setTimeout(() => {
        const { decks, cards, reviews, settings, version } = useQuadra.getState();
        void fetch("/api/store", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decks, cards, reviews, settings, version }),
        })
          .then(() => {
            if (useQuadra.getState().syncStatus !== "synced") {
              useQuadra.setState({ syncStatus: "synced" });
            }
          })
          .catch(() => useQuadra.setState({ syncStatus: "offline" }));
      }, 600);
    });
    return () => {
      if (syncTimer.current) window.clearTimeout(syncTimer.current);
      unsub();
    };
  }, []);

  return (
    <div className="flex min-h-screen bg-field p-4 md:p-6">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-[1280px] overflow-hidden rounded-[26px] bg-field shadow-sm md:min-h-[calc(100vh-3rem)]">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-auto rounded-[26px] bg-[#f3f3f0]">
          {route.name === "today" ? (
            <TodayView onOpenAdd={() => setAdding(true)} />
          ) : null}
          {route.name === "settings" ? <SettingsView /> : null}
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
            <CardsView
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
