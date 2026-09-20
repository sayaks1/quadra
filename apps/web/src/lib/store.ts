"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  applyRating,
  cardsAddedToday,
  createInitialFsrs,
  createSeedStore,
  dueCards,
  newId,
  searchCards,
  type Card,
  type Deck,
  type Language,
  type ProposedCard,
  type QuadraStore,
  type Rating,
  type ReviewLog,
} from "@quadra/shared";

export type Route =
  | { name: "today" }
  | { name: "search"; query?: string }
  | { name: "added-today" }
  | { name: "deck"; deckId: string; tab: "study" | "cards" | "stats" }
  | { name: "study"; deckId?: string };

type QuadraState = QuadraStore & {
  hydrated: boolean;
  route: Route;
  syncStatus: "local" | "synced" | "syncing" | "offline";
  setHydrated: (v: boolean) => void;
  setRoute: (route: Route) => void;
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
  rateCard: (id: string, rating: Rating) => void;
  importCards: (deckId: string, cards: ProposedCard[], audioSource?: Card["audioSource"]) => number;
  replaceStore: (store: QuadraStore) => void;
  getDue: (deckId?: string) => Card[];
  getAddedToday: () => Card[];
  search: (q: string) => Card[];
};

function touch() {
  return new Date().toISOString();
}

export const useQuadra = create<QuadraState>()(
  persist(
    (set, get) => {
      const seed = createSeedStore();
      return {
        ...seed,
        hydrated: false,
        route: { name: "today" },
        syncStatus: "local",
        setHydrated: (v) => set({ hydrated: v }),
        setRoute: (route) => set({ route }),
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
            fsrs: createInitialFsrs(new Date()),
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
          if (!card) return;
          const updated = applyRating(card, rating, now);
          const log: ReviewLog = {
            id: newId("rev"),
            cardId: id,
            rating,
            reviewedAt: now.toISOString(),
            scheduledDays: updated.fsrs.scheduled_days,
          };
          set((s) => ({
            cards: s.cards.map((c) => (c.id === id ? updated : c)),
            reviews: [...s.reviews, log],
          }));
        },
        importCards: (deckId, items, audioSource = "none") => {
          const now = touch();
          const cards: Card[] = items.map((item) => ({
            id: newId("card"),
            deckId,
            term: item.term,
            reading: item.reading,
            meaning: item.meaning,
            notes: item.notes,
            imageKey: null,
            audioKey: null,
            audioSource,
            fsrs: createInitialFsrs(new Date()),
            createdAt: now,
            updatedAt: now,
          }));
          set((s) => ({ cards: [...s.cards, ...cards] }));
          return cards.length;
        },
        replaceStore: (store) => set({ ...store }),
        getDue: (deckId) => dueCards(get().cards, new Date(), deckId),
        getAddedToday: () => cardsAddedToday(get().cards),
        search: (q) => searchCards(get().cards, q),
      };
    },
    {
      name: "quadra-store-v1",
      partialize: (s) => ({
        decks: s.decks,
        cards: s.cards,
        reviews: s.reviews,
        version: s.version,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    },
  ),
);
