import {
  Card as FsrsCard,
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating as FsrsRating,
  State,
  type Grade,
} from "ts-fsrs";
import type { Card, FsrsState, Rating } from "./types";

const scheduler = fsrs(
  generatorParameters({
    enable_fuzz: false,
    enable_short_term: true,
  }),
);

const ratingMap: Record<Rating, Grade> = {
  again: FsrsRating.Again,
  hard: FsrsRating.Hard,
  good: FsrsRating.Good,
  easy: FsrsRating.Easy,
};

function toFsrsCard(state: FsrsState): FsrsCard {
  const stateMap: Record<FsrsState["state"], State> = {
    new: State.New,
    learning: State.Learning,
    review: State.Review,
    relearning: State.Relearning,
  };
  return {
    ...createEmptyCard(new Date(state.due)),
    due: new Date(state.due),
    stability: state.stability,
    difficulty: state.difficulty,
    elapsed_days: state.elapsed_days,
    scheduled_days: state.scheduled_days,
    reps: state.reps,
    lapses: state.lapses,
    state: stateMap[state.state],
    last_review: state.last_review ? new Date(state.last_review) : undefined,
  };
}

function fromFsrsCard(card: FsrsCard): FsrsState {
  const stateMap: Record<State, FsrsState["state"]> = {
    [State.New]: "new",
    [State.Learning]: "learning",
    [State.Review]: "review",
    [State.Relearning]: "relearning",
  };
  return {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    state: stateMap[card.state],
    last_review: card.last_review ? card.last_review.toISOString() : null,
  };
}

export function createInitialFsrs(now = new Date()): FsrsState {
  return fromFsrsCard(createEmptyCard(now));
}

export function previewIntervals(card: Card, now = new Date()) {
  const fsrsCard = toFsrsCard(card.fsrs);
  const record = scheduler.repeat(fsrsCard, now);
  return {
    again: record[FsrsRating.Again].card.due,
    hard: record[FsrsRating.Hard].card.due,
    good: record[FsrsRating.Good].card.due,
    easy: record[FsrsRating.Easy].card.due,
  };
}

export function applyRating(card: Card, rating: Rating, now = new Date()): Card {
  const fsrsCard = toFsrsCard(card.fsrs);
  const result = scheduler.next(fsrsCard, now, ratingMap[rating]);
  return {
    ...card,
    fsrs: fromFsrsCard(result.card),
    updatedAt: now.toISOString(),
  };
}

export function formatInterval(from: Date, to: Date): string {
  const ms = Math.max(0, to.getTime() - from.getTime());
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.round(months / 12)}y`;
}

export function isDue(card: Card, now = new Date()): boolean {
  if (card.deletedAt) return false;
  return new Date(card.fsrs.due).getTime() <= now.getTime();
}

export function cardStatusLabel(card: Card, now = new Date()): string {
  if (card.fsrs.state === "new" && card.fsrs.reps === 0) return "new";
  if (isDue(card, now)) {
    const mins = Math.round((now.getTime() - new Date(card.fsrs.due).getTime()) / 60000);
    if (mins < 60) return `${Math.max(1, mins)}m`;
    return formatInterval(new Date(card.fsrs.due), now);
  }
  return formatInterval(now, new Date(card.fsrs.due));
}
