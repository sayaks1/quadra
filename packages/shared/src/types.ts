export type Language = "ko" | "ja" | "zh" | "en" | "other";

export type AudioSource = "tts" | "anki" | "user" | "none";

/** Anki-style card phase */
export type CardPhase = "new" | "learning" | "review" | "relearning";

export interface Deck {
  id: string;
  name: string;
  language: Language;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

/** Anki SM-2 + learning steps state (not FSRS) */
export interface AnkiState {
  phase: CardPhase;
  due: string;
  /** Review interval in days (Anki `ivl`) */
  intervalDays: number;
  /** Ease factor, default 2.5 (Anki `factor` / 1000) */
  ease: number;
  reps: number;
  lapses: number;
  /** Index into learningSteps / relearningSteps */
  learningStep: number;
  lastReview?: string | null;
}

export interface Card {
  id: string;
  deckId: string;
  term: string;
  reading: string;
  meaning: string;
  notes: string;
  imageKey?: string | null;
  audioKey?: string | null;
  audioSource: AudioSource;
  anki: AnkiState;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export type Rating = "again" | "hard" | "good" | "easy";

export interface ReviewLog {
  id: string;
  cardId: string;
  rating: Rating;
  reviewedAt: string;
  scheduledDays: number;
}

/** Deck/app scheduling options — Anki defaults */
export interface AnkiConfig {
  /** Learning steps in seconds, e.g. [60, 600] = 1m, 10m */
  learningSteps: number[];
  /** Relearning steps after a lapse */
  relearningSteps: number[];
  graduatingInterval: number;
  easyInterval: number;
  startingEase: number;
  easyBonus: number;
  hardInterval: number;
  intervalModifier: number;
  minimumInterval: number;
  /** When no other cards are due, show learning cards up to this many seconds early */
  learnAheadSeconds: number;
}

export const DEFAULT_ANKI_CONFIG: AnkiConfig = {
  learningSteps: [60, 600],
  relearningSteps: [600],
  graduatingInterval: 1,
  easyInterval: 4,
  startingEase: 2.5,
  easyBonus: 1.3,
  hardInterval: 1.2,
  intervalModifier: 1.0,
  minimumInterval: 1,
  learnAheadSeconds: 20 * 60,
};

export interface QuadraSettings {
  anki: AnkiConfig;
}

export interface QuadraStore {
  decks: Deck[];
  cards: Card[];
  reviews: ReviewLog[];
  settings: QuadraSettings;
  version: number;
}

export interface ProposedCard {
  term: string;
  reading: string;
  meaning: string;
  notes: string;
  language?: Language;
}
