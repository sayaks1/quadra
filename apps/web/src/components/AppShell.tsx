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

  // Pull cloud/local store on boot
  useEffect(() => {
    let cancelled = false;
    const replaceStore = useQuadra.getState().replaceStore;
    const setSyncBackend = useQuadra.getState().setSyncBackend;
    useQuadra.setState({ syncStatus: "syncing" });

    void (async () => {
      try {
        const res = await fetch("/api/store");
        const data = await res.json();
        if (cancelled) return;
        setSyncBackend(data.backend === "supabase" ? "supabase" : "local");

        const cloudHasData =
          Array.isArray(data.decks) &&
          Array.isArray(data.cards) &&
          (data.decks.length > 0 || data.cards.length > 0);

        if (data.backend === "supabase" && cloudHasData) {
          replaceStore({
            decks: data.decks,
            cards: data.cards,
            reviews: data.reviews ?? [],
            settings: data.settings,
            version: data.version ?? 3,
          });
          useQuadra.setState({ syncStatus: "synced" });
          return;
        }

        if (data.backend === "supabase" && !cloudHasData) {
          // Cloud is intentionally empty — don't re-upload demo seed
          const settings =
            data.settings?.anki
              ? data.settings
              : useQuadra.getState().settings;
          replaceStore({
            decks: [],
            cards: [],
            reviews: [],
            settings,
            version: data.version ?? 3,
          });
          useQuadra.setState({ syncStatus: "synced" });
          return;
        }

        useQuadra.setState({ syncStatus: "local" });
      } catch {
        if (!cancelled) useQuadra.setState({ syncStatus: "offline" });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const unsub = useQuadra.subscribe((state, prev) => {
      if (
        state.decks === prev.decks &&
        state.cards === prev.cards &&
        state.reviews === prev.reviews &&
        state.settings === prev.settings
      ) {
        return;
      }
      if (syncTimer.current) window.clearTimeout(syncTimer.current);
      syncTimer.current = window.setTimeout(() => {
        const { decks, cards, reviews, settings, version } = useQuadra.getState();
        useQuadra.setState({ syncStatus: "syncing" });
        void fetch("/api/store", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decks, cards, reviews, settings, version }),
        })
          .then(async (res) => {
            const data = await res.json().catch(() => ({}));
            if (data.backend === "supabase" || data.backend === "local") {
              useQuadra.getState().setSyncBackend(data.backend);
            }
            useQuadra.setState({
              syncStatus: res.ok
                ? data.backend === "supabase"
                  ? "synced"
                  : "local"
                : "offline",
            });
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
          {route.name === "search" ? (
            <CardsView
              global
              initialQuery={route.query ?? ""}
              initialAddedToday={route.addedToday ?? false}
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
            <StatsView deckId={route.deckId} />
          ) : null}
          {/* Legacy persisted routes used deck.tab === "study"; send them to study */}
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
