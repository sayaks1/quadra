export type Language = "ko" | "ja" | "zh" | "en" | "other";

export type AudioSource = "tts" | "anki" | "user" | "none";

export type CardState = "new" | "learning" | "review" | "relearning";

export interface Deck {
  id: string;
  name: string;
  language: Language;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface FsrsState {
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  state: CardState;
  last_review?: string | null;
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
  fsrs: FsrsState;
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

export interface QuadraStore {
  decks: Deck[];
  cards: Card[];
  reviews: ReviewLog[];
  version: number;
}

export interface ProposedCard {
  term: string;
  reading: string;
  meaning: string;
  notes: string;
  language?: Language;
}
