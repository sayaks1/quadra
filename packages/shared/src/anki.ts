import type { AnkiConfig, AnkiState, Card, Rating } from "./types";
import {
  DEFAULT_ANKI_CONFIG,
  LEARNING_EASY_CAP_DAYS,
  LEARNING_EASY_CAP_REPS,
} from "./types";

function addSeconds(date: Date, seconds: number) {
  return new Date(date.getTime() + seconds * 1000);
}

function clampEase(ease: number) {
  return Math.max(1.3, ease);
}

function dayStartHour(config: AnkiConfig) {
  const h = config.dayStartsAtHour ?? DEFAULT_ANKI_CONFIG.dayStartsAtHour;
  return Math.min(23, Math.max(0, Math.round(h)));
}

/**
 * Start of the current Anki study day (local time), using "next day starts at".
 * Before that hour, it is still the previous calendar day's study day.
 */
export function startOfStudyDay(
  now = new Date(),
  config: AnkiConfig = DEFAULT_ANKI_CONFIG,
): Date {
  const hour = dayStartHour(config);
  const start = new Date(now);
  start.setHours(hour, 0, 0, 0);
  if (now.getHours() < hour) {
    start.setDate(start.getDate() - 1);
  }
  return start;
}

/** Due instant for a review interval: start of study day + N days (Anki-style). */
export function reviewDueAt(
  now: Date,
  intervalDays: number,
  config: AnkiConfig = DEFAULT_ANKI_CONFIG,
): Date {
  const due = startOfStudyDay(now, config);
  due.setDate(due.getDate() + Math.max(1, Math.round(intervalDays)));
  return due;
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

/**
 * Easy while learning normally uses `easyInterval` (default 4d).
 * If the card has been repeated a lot (Again loops) or is relearning
 * after lapses, cap Easy at 2d — matching Anki's tighter jump.
 */
function easyGraduateDays(state: AnkiState, config: AnkiConfig): number {
  const struggled =
    state.reps >= LEARNING_EASY_CAP_REPS ||
    state.lapses > 0 ||
    state.phase === "relearning";
  if (struggled) {
    return Math.min(config.easyInterval, LEARNING_EASY_CAP_DAYS);
  }
  return config.easyInterval;
}

function graduate(
  state: AnkiState,
  now: Date,
  intervalDays: number,
  easeDelta: number,
  config: AnkiConfig = DEFAULT_ANKI_CONFIG,
): AnkiState {
  const days = Math.max(1, intervalDays);
  return {
    ...state,
    phase: "review",
    learningStep: 0,
    intervalDays: days,
    ease: clampEase(state.ease + easeDelta),
    due: reviewDueAt(now, days, config).toISOString(),
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
    return graduate(state, now, easyGraduateDays(state, config), 0.15, config);
  }

  // Good
  const nextStep = state.learningStep + 1;
  if (nextStep >= steps.length) {
    // Relearning Good after steps → back to review with at least graduating interval
    // (Anki uses new interval % of previous; we use graduatingInterval as floor)
    const reviewIvl =
      phase === "relearning"
        ? Math.max(config.minimumInterval, config.graduatingInterval)
        : config.graduatingInterval;
    return graduate(state, now, reviewIvl, 0, config);
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
    due: reviewDueAt(now, nextIvl, config).toISOString(),
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

/**
 * Anki-style button label for a rating:
 * learning/relearning → minutes; review → days, or months/years for long intervals.
 */
export function previewIntervalLabel(
  card: Card,
  rating: Rating,
  now = new Date(),
  config: AnkiConfig = DEFAULT_ANKI_CONFIG,
): string {
  const next = applyRating(card, rating, now, config).anki;
  if (next.phase === "learning" || next.phase === "relearning") {
    return formatLearningInterval(now, new Date(next.due));
  }
  return formatReviewIntervalDays(next.intervalDays);
}

/** Format a review interval in days as 12d / 2.3mo / 1.2y (Anki-like). */
export function formatReviewIntervalDays(intervalDays: number): string {
  const days = Math.max(1, intervalDays);
  if (days < 32) return `${Math.round(days)}d`;
  const months = days / 30;
  if (months < 12) {
    const rounded = Math.round(months * 10) / 10;
    return Number.isInteger(rounded) ? `${rounded.toFixed(0)}mo` : `${rounded.toFixed(1)}mo`;
  }
  const years = days / 365;
  const rounded = Math.round(years * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded.toFixed(0)}y` : `${rounded.toFixed(1)}y`;
}

/** Minute-scale labels for learning steps (Anki does not show multi-hour steps here). */
export function formatLearningInterval(from: Date, to: Date): string {
  const minutes = Math.max(0, Math.round((to.getTime() - from.getTime()) / 60000));
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${minutes}m`;
  // Long learning delays are still shown in minutes/hours, but round to hours only
  // when ≥60m (custom steps). Prefer minutes under 10h to stay Anki-like.
  if (minutes < 600) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  return `${hours}h`;
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
  // Prefer whole days when the span is roughly a day+ (Anki review fuzz / day boundary).
  const daysExact = ms / 86400_000;
  if (daysExact >= 0.75) {
    const days = Math.max(1, Math.round(daysExact));
    if (days < 30) return `${days}d`;
    const months = Math.round(days / 30);
    if (months < 12) return `${months}mo`;
    return `${Math.round(months / 12)}y`;
  }
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
  const due = new Date(card.anki.due);
  const t = now.getTime();

  // Learning steps stay minute-accurate.
  if (card.anki.phase === "learning" || card.anki.phase === "relearning") {
    if (due.getTime() <= t) return true;
    if (
      opts?.learnAhead &&
      due.getTime() - t <= config.learnAheadSeconds * 1000
    ) {
      return true;
    }
    return false;
  }

  // Reviews + new: due on the whole study day (Anki day boundary), not clock time.
  const dueDay = startOfStudyDay(due, config).getTime();
  const today = startOfStudyDay(now, config).getTime();
  return dueDay <= today;
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
