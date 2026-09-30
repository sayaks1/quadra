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
  const decks = useQuadra((s) => s.decks);
  const [editing, setEditing] = useState<Card | null>(null);
  const [adding, setAdding] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [cachedDeckId, setCachedDeckId] = useState<string | undefined>();
  const syncTimer = useRef<number | null>(null);

  useEffect(() => {
    if (route.name === "deck") setCachedDeckId(route.deckId);
    if (route.name === "study" && route.deckId) setCachedDeckId(route.deckId);
  }, [route]);

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

        if (cloudHasData && (data.backend === "supabase" || data.backend === "local")) {
          replaceStore({
            decks: data.decks,
            cards: data.cards,
            reviews: data.reviews ?? [],
            settings: data.settings,
            version: data.version ?? 3,
          });
          useQuadra.setState({
            syncStatus: data.backend === "supabase" ? "synced" : "local",
          });
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
        if (
          typeof window !== "undefined" &&
          (window as unknown as { __quadraPauseSync?: boolean }).__quadraPauseSync
        ) {
          return;
        }
        const { decks, cards, reviews, settings, version } = useQuadra.getState();
        useQuadra.setState({ syncStatus: "syncing" });
        void fetch("/api/store", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decks, cards, reviews, settings, version }),
        })
          .then(async (res) => {
            const data = await res.json().catch(() => ({}));
            if (res.status === 409 && data.skipped) {
              // Another tab/server has more data — pull instead of fighting
              try {
                const fresh = await fetch("/api/store");
                const remote = await fresh.json();
                if (Array.isArray(remote.cards) && remote.cards.length > cards.length) {
                  useQuadra.getState().replaceStore({
                    decks: remote.decks,
                    cards: remote.cards,
                    reviews: remote.reviews ?? [],
                    settings: remote.settings ?? settings,
                    version: remote.version ?? version,
                  });
                }
              } catch {
                /* ignore */
              }
              useQuadra.setState({ syncStatus: "synced" });
              return;
            }
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

  const showToday = route.name === "today";
  const showSearch = route.name === "search";
  const showSettings = route.name === "settings";
  const showDeckCards = route.name === "deck" && route.tab === "cards";
  const showDeckStats = route.name === "deck" && route.tab === "stats";
  const showStudy =
    route.name === "study" || (route.name === "deck" && route.tab === "study");
  const studyDeckId = route.name === "study" || route.name === "deck" ? route.deckId : undefined;
  const deckId =
    route.name === "deck" ? route.deckId : cachedDeckId;

  const title =
    route.name === "today"
      ? "Today"
      : route.name === "search"
        ? "Search"
        : route.name === "settings"
          ? "Settings"
          : route.name === "study"
            ? "Study"
            : route.name === "deck"
              ? (decks.find((d) => d.id === route.deckId)?.name ?? "Deck")
              : "Quadra";

  return (
    <div className="flex min-h-[100dvh] bg-field p-0 md:p-6">
      <div className="mx-auto flex h-[100dvh] w-full max-w-[1280px] overflow-hidden bg-field md:h-[calc(100dvh-3rem)] md:rounded-[26px] md:shadow-sm">
        <Sidebar mobileOpen={menuOpen} onMobileClose={() => setMenuOpen(false)} />
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Mobile top bar */}
          <header className="flex items-center gap-3 border-b border-stone/20 bg-[#f3f3f0] px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] md:hidden">
            <button
              type="button"
              aria-label="Open menu"
              onClick={() => setMenuOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-card text-ink shadow-sm"
            >
              <MenuIcon />
            </button>
            <div className="min-w-0 flex-1 truncate font-serif text-[22px]">{title}</div>
          </header>
          <main className="relative min-w-0 flex-1 overflow-auto bg-[#f3f3f0] pb-[env(safe-area-inset-bottom)] md:rounded-[26px]">
          {/* Keep primary tabs mounted to avoid remount flicker when switching. */}
          <div className={showToday ? "h-full" : "hidden"} aria-hidden={!showToday}>
            <TodayView onOpenAdd={() => setAdding(true)} />
          </div>
          <div className={showSearch ? "h-full" : "hidden"} aria-hidden={!showSearch}>
            <CardsView
              global
              initialQuery={route.name === "search" ? (route.query ?? "") : ""}
              initialAddedToday={route.name === "search" ? (route.addedToday ?? false) : false}
              onEdit={setEditing}
              onOpenAdd={() => setAdding(true)}
            />
          </div>
          <div className={showSettings ? "h-full" : "hidden"} aria-hidden={!showSettings}>
            <SettingsView />
          </div>
          {deckId ? (
            <>
              <div
                className={showDeckCards ? "h-full" : "hidden"}
                aria-hidden={!showDeckCards}
              >
                <CardsView
                  deckId={deckId}
                  onEdit={setEditing}
                  onOpenAdd={() => setAdding(true)}
                />
              </div>
              <div
                className={showDeckStats ? "h-full" : "hidden"}
                aria-hidden={!showDeckStats}
              >
                <StatsView deckId={deckId} />
              </div>
            </>
          ) : null}
          {/* Study still mounts fresh so each session starts clean. */}
          {showStudy ? <StudyView deckId={studyDeckId} /> : null}
          </main>
        </div>
      </div>
      <EditCardModal card={editing} onClose={() => setEditing(null)} />
      {adding ? <AddFlowModal onClose={() => setAdding(false)} /> : null}
    </div>
  );
}

function MenuIcon() {
  return (
    <svg width="18" height="14" viewBox="0 0 18 14" aria-hidden>
      <path
        d="M1 1h16M1 7h16M1 13h16"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}
