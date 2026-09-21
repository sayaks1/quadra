"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  applyRating,
  cardsAddedToday,
  createInitialAnki,
  createSeedStore,
  DEFAULT_ANKI_CONFIG,
  dueCards,
  newId,
  searchCards,
  type AnkiConfig,
  type Card,
  type Deck,
  type Language,
  type ProposedCard,
  type QuadraSettings,
  type QuadraStore,
  type Rating,
  type ReviewLog,
} from "@quadra/shared";

export type Route =
  | { name: "today" }
  | { name: "search"; query?: string; addedToday?: boolean }
  | { name: "deck"; deckId: string; tab: "study" | "cards" | "stats" }
  | { name: "study"; deckId?: string }
  | { name: "settings" };

type QuadraState = QuadraStore & {
  hydrated: boolean;
  route: Route;
  syncStatus: "local" | "synced" | "syncing" | "offline";
  syncBackend: "local" | "supabase" | "unknown";
  setHydrated: (v: boolean) => void;
  setRoute: (route: Route) => void;
  setSyncBackend: (backend: "local" | "supabase" | "unknown") => void;
  resetDemo: () => void;
  addDeck: (name: string, language: Language) => string;
  upsertCard: (input: {
    id?: string;
    deckId: string;
    term: string;
    reading: string;
    meaning: string;
    notes?: string;
    audioKey?: string | null;
    audioSource?: Card["audioSource"];
    imageKey?: string | null;
  }) => string;
  deleteCard: (id: string) => void;
  /** Returns the updated card after rating */
  rateCard: (id: string, rating: Rating) => Card | null;
  importCards: (deckId: string, cards: ProposedCard[], audioSource?: Card["audioSource"]) => number;
  replaceStore: (store: QuadraStore) => void;
  updateSettings: (partial: { anki?: Partial<AnkiConfig> }) => void;
  getDue: (deckId?: string) => Card[];
  getAddedToday: () => Card[];
  search: (q: string) => Card[];
};

function touch() {
  return new Date().toISOString();
}

function defaultSettings(): QuadraSettings {
  return {
    anki: {
      ...DEFAULT_ANKI_CONFIG,
      learningSteps: [...DEFAULT_ANKI_CONFIG.learningSteps],
      relearningSteps: [...DEFAULT_ANKI_CONFIG.relearningSteps],
    },
  };
}

export const useQuadra = create<QuadraState>()(
  persist(
    (set, get) => {
      const seed = createSeedStore();
      return {
        ...seed,
        settings: seed.settings ?? defaultSettings(),
        hydrated: true,
        route: { name: "today" },
        syncStatus: "local",
        syncBackend: "unknown",
        setHydrated: (v) => set({ hydrated: v }),
        setRoute: (route) => set({ route }),
        setSyncBackend: (syncBackend) => set({ syncBackend }),
        resetDemo: () => set({ ...createSeedStore(), route: { name: "today" } }),
        addDeck: (name, language) => {
          const id = newId("deck");
          const now = touch();
          const deck: Deck = {
            id,
            name,
            language,
            createdAt: now,
            updatedAt: now,
          };
          set((s) => ({ decks: [...s.decks, deck] }));
          return id;
        },
        upsertCard: (input) => {
          const now = touch();
          const existing = input.id
            ? get().cards.find((c) => c.id === input.id)
            : undefined;
          if (existing) {
            const updated: Card = {
              ...existing,
              deckId: input.deckId,
              term: input.term,
              reading: input.reading,
              meaning: input.meaning,
              notes: input.notes ?? "",
              audioKey: input.audioKey ?? existing.audioKey,
              audioSource: input.audioSource ?? existing.audioSource,
              imageKey: input.imageKey ?? existing.imageKey,
              updatedAt: now,
            };
            set((s) => ({
              cards: s.cards.map((c) => (c.id === updated.id ? updated : c)),
            }));
            return updated.id;
          }
          const id = newId("card");
          const card: Card = {
            id,
            deckId: input.deckId,
            term: input.term,
            reading: input.reading,
            meaning: input.meaning,
            notes: input.notes ?? "",
            imageKey: input.imageKey ?? null,
            audioKey: input.audioKey ?? null,
            audioSource: input.audioSource ?? "none",
            anki: createInitialAnki(new Date(), get().settings.anki),
            createdAt: now,
            updatedAt: now,
          };
          set((s) => ({ cards: [...s.cards, card] }));
          return id;
        },
        deleteCard: (id) => {
          const now = touch();
          set((s) => ({
            cards: s.cards.map((c) =>
              c.id === id ? { ...c, deletedAt: now, updatedAt: now } : c,
            ),
          }));
        },
        rateCard: (id, rating) => {
          const now = new Date();
          const card = get().cards.find((c) => c.id === id);
          if (!card) return null;
          const updated = applyRating(card, rating, now, get().settings.anki);
          const log: ReviewLog = {
            id: newId("rev"),
            cardId: id,
            rating,
            reviewedAt: now.toISOString(),
            scheduledDays: updated.anki.intervalDays,
          };
          set((s) => ({
            cards: s.cards.map((c) => (c.id === id ? updated : c)),
            reviews: [...s.reviews, log],
          }));
          return updated;
        },
        importCards: (deckId, items, audioSource = "none") => {
          const now = touch();
          const config = get().settings.anki;
          const cards: Card[] = items.map((item) => ({
            id: newId("card"),
            deckId,
            term: item.term,
            reading: item.reading,
            meaning: item.meaning,
            notes: item.notes,
            imageKey: item.imageKey ?? null,
            audioKey: item.audioKey ?? null,
            audioSource,
            anki: createInitialAnki(new Date(), config),
            createdAt: now,
            updatedAt: now,
          }));
          set((s) => ({ cards: [...s.cards, ...cards] }));
          return cards.length;
        },
        replaceStore: (store) =>
          set({
            ...store,
            settings: store.settings ?? defaultSettings(),
          }),
        updateSettings: (partial) => {
          set((s) => ({
            settings: {
              anki: {
                ...s.settings.anki,
                ...partial.anki,
                learningSteps:
                  partial.anki?.learningSteps ?? s.settings.anki.learningSteps,
                relearningSteps:
                  partial.anki?.relearningSteps ?? s.settings.anki.relearningSteps,
              },
            },
          }));
        },
        getDue: (deckId) =>
          dueCards(get().cards, new Date(), deckId, get().settings.anki),
        getAddedToday: () => cardsAddedToday(get().cards),
        search: (q) => searchCards(get().cards, q),
      };
    },
    {
      name: "quadra-store-v4",
      partialize: (s) => ({
        decks: s.decks,
        cards: s.cards,
        reviews: s.reviews,
        settings: s.settings,
        version: s.version,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
        if (state && !state.settings?.anki) {
          state.updateSettings({ anki: defaultSettings().anki });
        }
        if (typeof window !== "undefined") {
          (window as unknown as { __quadra: typeof useQuadra }).__quadra = useQuadra;
        }
      },
    },
  ),
);

if (typeof window !== "undefined") {
  (window as unknown as { __quadra: typeof useQuadra }).__quadra = useQuadra;
}
