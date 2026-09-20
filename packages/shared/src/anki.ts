import type { AnkiConfig, AnkiState, Card, Rating } from "./types";
import { DEFAULT_ANKI_CONFIG } from "./types";

function addSeconds(date: Date, seconds: number) {
  return new Date(date.getTime() + seconds * 1000);
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86400_000);
}

function clampEase(ease: number) {
  return Math.max(1.3, ease);
}

export function createInitialAnki(now = new Date(), config: AnkiConfig = DEFAULT_ANKI_CONFIG): AnkiState {
  const first = config.learningSteps[0] ?? 60;
  return {
    phase: "new",
    due: now.toISOString(),
    intervalDays: 0,
    ease: config.startingEase,
    reps: 0,
    lapses: 0,
    learningStep: 0,
    lastReview: null,
  };
}

function stepsFor(state: AnkiState, config: AnkiConfig) {
  return state.phase === "relearning" ? config.relearningSteps : config.learningSteps;
}

function graduate(
  state: AnkiState,
  now: Date,
  intervalDays: number,
  easeDelta: number,
): AnkiState {
  return {
    ...state,
    phase: "review",
    learningStep: 0,
    intervalDays: Math.max(1, intervalDays),
    ease: clampEase(state.ease + easeDelta),
    due: addDays(now, Math.max(1, intervalDays)).toISOString(),
    reps: state.reps + 1,
    lastReview: now.toISOString(),
  };
}

function enterLearning(
  state: AnkiState,
  now: Date,
  config: AnkiConfig,
  phase: "learning" | "relearning",
  stepIndex: number,
): AnkiState {
  const steps = phase === "relearning" ? config.relearningSteps : config.learningSteps;
  const step = Math.max(0, Math.min(stepIndex, Math.max(0, steps.length - 1)));
  const delay = steps[step] ?? 60;
  return {
    ...state,
    phase,
    learningStep: step,
    intervalDays: 0,
    due: addSeconds(now, delay).toISOString(),
    reps: state.reps + 1,
    lastReview: now.toISOString(),
  };
}

function applyLearningRating(
  state: AnkiState,
  rating: Rating,
  now: Date,
  config: AnkiConfig,
): AnkiState {
  const steps = stepsFor(state, config);
  const phase = state.phase === "relearning" ? "relearning" : "learning";

  if (rating === "again") {
    return enterLearning(
      {
        ...state,
        lapses: phase === "relearning" ? state.lapses : state.lapses,
      },
      now,
      config,
      phase === "relearning" ? "relearning" : "learning",
      0,
    );
  }

  if (rating === "hard") {
    // Anki: repeat current step with at least current delay (often ~1.5x of step)
    const delay = Math.max(steps[state.learningStep] ?? 60, 60) * 1.5;
    return {
      ...state,
      phase,
      due: addSeconds(now, delay).toISOString(),
      reps: state.reps + 1,
      lastReview: now.toISOString(),
    };
  }

  if (rating === "easy") {
    return graduate(state, now, config.easyInterval, 0.15);
  }

  // Good
  const nextStep = state.learningStep + 1;
  if (nextStep >= steps.length) {
    const ivl =
      phase === "relearning"
        ? Math.max(config.minimumInterval, Math.round(state.intervalDays * 0) || config.graduatingInterval)
        : config.graduatingInterval;
    // Relearning Good after steps → back to review with at least graduating interval
    // (Anki uses new interval % of previous; we use graduatingInterval as floor)
    const reviewIvl =
      phase === "relearning"
        ? Math.max(config.minimumInterval, config.graduatingInterval)
        : config.graduatingInterval;
    return graduate(state, now, reviewIvl, 0);
  }

  return enterLearning(state, now, config, phase, nextStep);
}

function applyReviewRating(
  state: AnkiState,
  rating: Rating,
  now: Date,
  config: AnkiConfig,
): AnkiState {
  if (rating === "again") {
    return enterLearning(
      {
        ...state,
        lapses: state.lapses + 1,
        ease: clampEase(state.ease - 0.2),
        intervalDays: state.intervalDays, // kept for reference; relearning clears display ivl
      },
      now,
      config,
      "relearning",
      0,
    );
  }

  let nextIvl = state.intervalDays;
  let ease = state.ease;

  if (rating === "hard") {
    nextIvl = Math.max(
      config.minimumInterval,
      Math.round(state.intervalDays * config.hardInterval * config.intervalModifier),
    );
    ease = clampEase(ease - 0.15);
  } else if (rating === "good") {
    nextIvl = Math.max(
      config.minimumInterval,
      Math.round(state.intervalDays * ease * config.intervalModifier),
    );
    // Ensure progress of at least +1 day over previous when possible
    if (nextIvl <= state.intervalDays) nextIvl = state.intervalDays + 1;
  } else {
    // easy
    nextIvl = Math.max(
      config.minimumInterval,
      Math.round(state.intervalDays * ease * config.easyBonus * config.intervalModifier),
    );
    if (nextIvl <= state.intervalDays) nextIvl = state.intervalDays + 1;
    ease = clampEase(ease + 0.15);
  }

  return {
    ...state,
    phase: "review",
    learningStep: 0,
    intervalDays: nextIvl,
    ease,
    due: addDays(now, nextIvl).toISOString(),
    reps: state.reps + 1,
    lastReview: now.toISOString(),
  };
}

export function applyRating(
  card: Card,
  rating: Rating,
  now = new Date(),
  config: AnkiConfig = DEFAULT_ANKI_CONFIG,
): Card {
  const state = card.anki;
  let next: AnkiState;

  if (state.phase === "new" || state.phase === "learning" || state.phase === "relearning") {
    // Treat "new" like learning step 0
    const learningState: AnkiState =
      state.phase === "new"
        ? { ...state, phase: "learning", learningStep: 0 }
        : state;
    next = applyLearningRating(learningState, rating, now, config);
  } else {
    next = applyReviewRating(state, rating, now, config);
  }

  return {
    ...card,
    anki: next,
    updatedAt: now.toISOString(),
  };
}

export function previewIntervals(
  card: Card,
  now = new Date(),
  config: AnkiConfig = DEFAULT_ANKI_CONFIG,
) {
  return {
    again: applyRating(card, "again", now, config).anki.due,
    hard: applyRating(card, "hard", now, config).anki.due,
    good: applyRating(card, "good", now, config).anki.due,
    easy: applyRating(card, "easy", now, config).anki.due,
  };
}

/** Still in learning/relearning — keep in session until graduated to day+ review */
export function shouldRequeueInSession(card: Card): boolean {
  return card.anki.phase === "learning" || card.anki.phase === "relearning" || card.anki.phase === "new";
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

export function isDue(
  card: Card,
  now = new Date(),
  config: AnkiConfig = DEFAULT_ANKI_CONFIG,
  opts?: { learnAhead?: boolean },
): boolean {
  if (card.deletedAt) return false;
  const due = new Date(card.anki.due).getTime();
  const t = now.getTime();
  if (due <= t) return true;
  if (
    opts?.learnAhead &&
    (card.anki.phase === "learning" || card.anki.phase === "relearning") &&
    due - t <= config.learnAheadSeconds * 1000
  ) {
    return true;
  }
  return false;
}

export function cardStatusLabel(card: Card, now = new Date()): string {
  if (card.anki.phase === "new" && card.anki.reps === 0) return "new";
  if (isDue(card, now)) {
    const mins = Math.round((now.getTime() - new Date(card.anki.due).getTime()) / 60000);
    if (mins < 60) return `${Math.max(0, mins)}m`;
    return formatInterval(new Date(card.anki.due), now);
  }
  return formatInterval(now, new Date(card.anki.due));
}

/** @deprecated use createInitialAnki */
export const createInitialFsrs = createInitialAnki;
