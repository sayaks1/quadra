"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  deckStats,
  shouldRequeueInSession,
  type Card,
  type Rating,
} from "@quadra/shared";
import { EditCardModal } from "@/components/EditCardModal";
import { FitText, useStudyDisplayMaxPx } from "@/components/FitText";
import { RatingBar } from "@/components/RatingBar";
import { PillButton } from "@/components/ui";
import { mediaUrl } from "@/lib/media-url";
import { useQuadra } from "@/lib/store";

/** Map a key event to a study rating — j k l ; (and Anki 1–4). */
function ratingFromKeyboard(e: KeyboardEvent): Rating | null {
  switch (e.code) {
    case "KeyJ":
    case "Digit1":
    case "Numpad1":
      return "again";
    case "KeyK":
    case "Digit2":
    case "Numpad2":
      return "hard";
    case "KeyL":
    case "Digit3":
    case "Numpad3":
      return "good";
    case "Semicolon":
    case "Digit4":
    case "Numpad4":
      return "easy";
    default:
      break;
  }
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (key === "j" || key === "1") return "again";
  if (key === "k" || key === "2") return "hard";
  if (key === "l" || key === "3") return "good";
  if (key === ";" || key === "4") return "easy";
  return null;
}

function isRealTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.dataset.quadraStudyHotkeys === "1") return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

export function StudyView({ deckId }: { deckId?: string }) {
  const cards = useQuadra((s) => s.cards);
  const decks = useQuadra((s) => s.decks);
  const reviews = useQuadra((s) => s.reviews);
  const anki = useQuadra((s) => s.settings.anki);
  const getDue = useQuadra((s) => s.getDue);
  const rateCard = useQuadra((s) => s.rateCard);
  const setRoute = useQuadra((s) => s.setRoute);

  const [queue, setQueue] = useState<Card[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  const [startedAt] = useState(() => Date.now());
  const [flash, setFlash] = useState<string | null>(null);
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const flashTimer = useRef<number | null>(null);

  const hotkeyRef = useRef<HTMLInputElement>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const revealedRef = useRef(revealed);
  const editingRef = useRef(false);
  const currentRef = useRef<Card | undefined>(undefined);
  const playAudioRef = useRef<() => void>(() => undefined);
  const revealRef = useRef<() => void>(() => undefined);
  const rateRef = useRef<(rating: Rating) => void>(() => undefined);
  const openEditRef = useRef<() => void>(() => undefined);

  const current = queue[0];
  const deck = decks.find((d) => d.id === (deckId || current?.deckId));
  const stats = deck ? deckStats(cards, deck.id, new Date(), anki, reviews) : null;
  const totalSession = doneCount + queue.length;
  const progress = totalSession === 0 ? 1 : doneCount / totalSession;

  const audioUrl = useMemo(() => mediaUrl(current?.audioKey), [current]);
  const imageUrl = useMemo(() => mediaUrl(current?.imageKey), [current]);
  const displayMaxPx = useStudyDisplayMaxPx(28, 34);

  const focusHotkeys = useCallback(() => {
    const el = hotkeyRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
  }, []);

  const stopAudio = useCallback(() => {
    const el = audioElRef.current;
    if (el) {
      el.pause();
      el.currentTime = 0;
    }
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }, []);

  const playAudio = useCallback(() => {
    if (!current) return;
    stopAudio();

    if (audioUrl) {
      let el = audioElRef.current;
      if (!el || el.src !== new URL(audioUrl, window.location.href).href) {
        el = new Audio(audioUrl);
        el.preload = "auto";
        audioElRef.current = el;
      }
      el.currentTime = 0;
      void el.play().catch(() => {
        void speakFallback(current.term, deck?.language);
      });
      return;
    }

    void speakFallback(current.term, deck?.language);
  }, [audioUrl, current, deck?.language, stopAudio]);

  const reveal = useCallback(() => {
    setRevealed(true);
    // Play in the same user-gesture turn as the flip (click / Space),
    // before any focus work that can break autoplay on iOS Safari.
    playAudio();
    requestAnimationFrame(() => focusHotkeys());
  }, [focusHotkeys, playAudio]);

  const openEdit = useCallback(() => {
    const card = currentRef.current;
    if (!card) return;
    stopAudio();
    setEditingCard(card);
  }, [stopAudio]);

  const closeEdit = useCallback(() => {
    setEditingCard(null);
    requestAnimationFrame(() => focusHotkeys());
  }, [focusHotkeys]);

  const handleRate = useCallback(
    (rating: Rating) => {
      const card = currentRef.current;
      if (!card) return;
      stopAudio();
      const updated = rateCard(card.id, rating);
      const labels: Record<Rating, string> = {
        again: "Again",
        hard: "Hard",
        good: "Good",
        easy: "Easy",
      };
      let detail = labels[rating];
      if (updated) {
        if (shouldRequeueInSession(updated)) {
          const due = new Date(updated.anki.due);
          const mins = Math.max(
            1,
            Math.round((due.getTime() - Date.now()) / 60000),
          );
          detail = `${labels[rating]} · back in ${mins}m`;
        } else {
          const days = updated.anki.intervalDays;
          detail =
            days < 1
              ? labels[rating]
              : `${labels[rating]} · next in ${days}d`;
        }
      }
      if (flashTimer.current) window.clearTimeout(flashTimer.current);
      setFlash(detail);
      flashTimer.current = window.setTimeout(() => setFlash(null), 1200);

      setDoneCount((n) => n + 1);
      setRevealed(false);
      setQueue((q) => {
        const rest = q.slice(1);
        if (updated && shouldRequeueInSession(updated)) {
          return [...rest, updated];
        }
        return rest;
      });
      requestAnimationFrame(() => focusHotkeys());
    },
    [rateCard, focusHotkeys, stopAudio],
  );

  revealedRef.current = revealed;
  editingRef.current = editingCard != null;
  currentRef.current = current;
  playAudioRef.current = playAudio;
  revealRef.current = reveal;
  rateRef.current = handleRate;
  openEditRef.current = openEdit;

  const handleHotkeyEvent = useCallback((e: KeyboardEvent) => {
    if (editingRef.current) return;
    if (isRealTypingTarget(e.target)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (!currentRef.current) return;

    const code = e.code;

    if (code === "KeyE") {
      e.preventDefault();
      e.stopPropagation();
      openEditRef.current();
      return;
    }

    if (code === "KeyA" || code === "KeyR") {
      e.preventDefault();
      e.stopPropagation();
      playAudioRef.current();
      return;
    }

    if (!revealedRef.current) {
      const wantsReveal =
        code === "Space" ||
        code === "Enter" ||
        e.key === "Enter" ||
        ratingFromKeyboard(e) != null;
      if (wantsReveal) {
        e.preventDefault();
        e.stopPropagation();
        revealRef.current();
      }
      return;
    }

    const rating = ratingFromKeyboard(e);
    if (rating) {
      e.preventDefault();
      e.stopPropagation();
      rateRef.current(rating);
    }
  }, []);

  useEffect(() => {
    setQueue(getDue(deckId));
    setRevealed(false);
    setDoneCount(0);
    setEditingCard(null);
    requestAnimationFrame(() => focusHotkeys());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh when deck or card count changes
  }, [deckId, cards.length]);

  // Keep the current study card in sync after in-session edits / deletes.
  useEffect(() => {
    setQueue((q) => {
      if (q.length === 0) return q;
      let changed = false;
      const next: Card[] = [];
      for (const item of q) {
        const fresh = cards.find((c) => c.id === item.id && !c.deletedAt);
        if (!fresh) {
          changed = true;
          continue;
        }
        if (deckId && fresh.deckId !== deckId) {
          changed = true;
          continue;
        }
        if (fresh.updatedAt !== item.updatedAt) {
          changed = true;
          next.push(fresh);
        } else {
          next.push(item);
        }
      }
      return changed ? next : q;
    });
    setEditingCard((editing) => {
      if (!editing) return editing;
      const stillExists = cards.some((c) => c.id === editing.id && !c.deletedAt);
      if (!stillExists) {
        requestAnimationFrame(() => focusHotkeys());
        return null;
      }
      return editing;
    });
  }, [cards, deckId, focusHotkeys]);

  // Prefetch the current card's audio so flip playback starts immediately.
  useEffect(() => {
    stopAudio();
    if (!audioUrl) {
      audioElRef.current = null;
      return;
    }
    const el = new Audio(audioUrl);
    el.preload = "auto";
    audioElRef.current = el;
    return () => {
      el.pause();
      if (audioElRef.current === el) audioElRef.current = null;
    };
  }, [audioUrl, stopAudio]);

  // Window capture listener as backup; primary path is the IME-disabled input
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      handleHotkeyEvent(e);
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [handleHotkeyEvent]);

  // Keep the hotkey trap focused while studying (unless user is in a real field)
  useEffect(() => {
    function onFocusIn(e: FocusEvent) {
      if (editingRef.current) return;
      if (!currentRef.current) return;
      if (isRealTypingTarget(e.target)) return;
      const t = e.target;
      if (t instanceof HTMLElement && t.dataset.quadraStudyHotkeys === "1") return;
      requestAnimationFrame(() => focusHotkeys());
    }
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, [focusHotkeys]);

  if (!current) {
    const minutes = Math.max(1, Math.round((Date.now() - startedAt) / 60000));
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="w-full max-w-md rounded-[26px] bg-card px-10 py-12 text-center shadow-sm">
          <div className="mx-auto mb-6 flex h-10 w-10 items-center justify-center rounded-full bg-field">
            <span className="h-3 w-3 rounded-full bg-oxblood" />
          </div>
          <h2 className="font-serif text-[34px]">Done for today</h2>
          <p className="mt-3 text-[14.5px] text-stone">
            {doneCount} cards answered in {minutes} minute{minutes === 1 ? "" : "s"}.
          </p>
          <div className="mt-8 flex justify-center gap-2">
            <PillButton variant="ghost" onClick={() => setRoute({ name: "today" })}>
              Back to Today
            </PillButton>
            {deck ? (
              <PillButton
                variant="oxblood"
                onClick={() => setRoute({ name: "deck", deckId: deck.id, tab: "stats" })}
              >
                See your stats
              </PillButton>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative flex h-full min-w-0 flex-col overflow-x-hidden p-5 md:p-8"
      onMouseDown={(e) => {
        if (isRealTypingTarget(e.target)) return;
        // Don't steal clicks from buttons — but refocus hotkeys after
        requestAnimationFrame(() => focusHotkeys());
      }}
    >
      {/*
        Password + lang=en disables CJK IMEs on most OSes so j/k/l reach us
        as raw keydowns instead of starting pinyin composition (which is why
        semicolon worked — it isn't a pinyin letter — while j/1 did not).
      */}
      <input
        ref={hotkeyRef}
        data-quadra-study-hotkeys="1"
        type="password"
        lang="en"
        inputMode="none"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        aria-label="Study shortcuts"
        value=""
        onChange={() => {
          /* keep empty */
        }}
        className="pointer-events-none absolute h-px w-px opacity-0"
        tabIndex={0}
      />

      <div className="mb-4">
        <div className="mb-3 h-[3px] overflow-hidden rounded-full bg-stone/30">
          <div
            className="h-full rounded-full bg-oxblood transition-all"
            style={{ width: `${Math.max(6, progress * 100)}%` }}
          />
        </div>
        <div className="flex items-center justify-between gap-3 text-[14.5px]">
          <span className="font-medium">{deck?.name ?? "All decks"}</span>
          <div className="flex items-center gap-3">
            <span className="text-stone">
              {flash ? (
                <span className="font-medium text-oxblood">{flash}</span>
              ) : stats ? (
                stats.neu > stats.newDue
                  ? `${queue.length} due · ${stats.newDue} new today (${stats.neu} in pile)`
                  : `${queue.length} due · ${stats.neu} new · ${stats.learning} learning`
              ) : (
                `${queue.length} left`
              )}
            </span>
            <button
              type="button"
              tabIndex={-1}
              title="Edit card (E)"
              aria-label="Edit card"
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.stopPropagation();
                openEdit();
              }}
              className="rounded-full border border-stone/40 bg-card px-3 py-1 text-[12px] font-medium text-ink transition hover:bg-field"
            >
              Edit
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full min-w-0 max-w-2xl flex-1 flex-col justify-center">
        <div
          role="button"
          tabIndex={-1}
          onClick={() => {
            if (!revealed) reveal();
            else focusHotkeys();
          }}
          className="w-full min-w-0 cursor-pointer rounded-[20px] bg-card px-5 py-8 text-center shadow-sm outline-none md:px-8 md:py-10"
        >
          <div className="mb-8 text-[12px] text-stone">
            {current.anki.phase === "new" ||
            (current.anki.phase === "learning" && current.anki.reps === 0)
              ? "New"
              : current.anki.phase === "learning" || current.anki.phase === "relearning"
                ? `Learning · step ${current.anki.learningStep + 1} · seen ${current.anki.reps} times`
                : `Review · seen ${current.anki.reps} times`}
          </div>
          <FitText
            maxPx={displayMaxPx}
            minPx={22}
            className="font-serif leading-snug text-ink"
          >
            {current.meaning}
          </FitText>
          {revealed ? (
            <>
              <div className="my-8 h-px bg-stone/30" />
              <div className="flex min-w-0 items-start justify-center gap-3">
                <FitText
                  maxPx={displayMaxPx}
                  minPx={22}
                  className="flex-1 font-serif leading-snug"
                >
                  {current.term}
                  {current.reading ? (
                    <span
                      className="font-sans text-stone"
                      style={{ fontSize: "0.6em" }}
                    >
                      {" "}
                      ({current.reading})
                    </span>
                  ) : null}
                </FitText>
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label="Play audio"
                  title="Play audio (A)"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.stopPropagation();
                    playAudio();
                  }}
                  className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-stone/50 text-ink transition hover:bg-field"
                >
                  <PlayIcon />
                </button>
              </div>
              {imageUrl ? (
                <div className="mt-6 overflow-hidden rounded-[16px] bg-field">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imageUrl}
                    alt=""
                    className="mx-auto max-h-56 w-full object-contain"
                  />
                </div>
              ) : null}
              {current.notes.trim() ? (
                <ExampleNotes notes={current.notes} />
              ) : null}
            </>
          ) : null}
        </div>

        <div className="mt-6">
          {!revealed ? (
            <div>
              <PillButton
                variant="ink"
                className="w-full py-3.5"
                onMouseDown={(e) => e.preventDefault()}
                onClick={reveal}
              >
                Show answer
              </PillButton>
              <div className="mt-4 hidden flex-wrap justify-center gap-x-4 gap-y-2 text-[12px] text-stone md:flex">
                <span>
                  <kbd className="rounded bg-card px-1.5 py-0.5">Space</kbd> reveal
                </span>
                <span>
                  <kbd className="rounded bg-card px-1.5 py-0.5">e</kbd> edit
                </span>
                <span>
                  <kbd className="rounded bg-card px-1.5 py-0.5">a</kbd> audio
                </span>
                <span>
                  <kbd className="rounded bg-card px-1.5 py-0.5">Esc</kbd> exit
                </span>
              </div>
            </div>
          ) : (
            <>
              <RatingBar card={current} onRate={handleRate} showKeys />
              <div className="mt-4 hidden flex-wrap justify-center gap-x-4 gap-y-2 text-[12px] text-stone md:flex">
                <span>
                  <kbd className="rounded bg-card px-1.5 py-0.5">j</kbd> Again
                </span>
                <span>
                  <kbd className="rounded bg-card px-1.5 py-0.5">k</kbd> Hard
                </span>
                <span>
                  <kbd className="rounded bg-card px-1.5 py-0.5">l</kbd> Good
                </span>
                <span>
                  <kbd className="rounded bg-card px-1.5 py-0.5">;</kbd> Easy
                </span>
                <span>
                  <kbd className="rounded bg-card px-1.5 py-0.5">e</kbd> edit
                </span>
                <span>
                  <kbd className="rounded bg-card px-1.5 py-0.5">Esc</kbd> exit
                </span>
              </div>
            </>
          )}
        </div>
      </div>
      <EditCardModal card={editingCard} onClose={closeEdit} />
    </div>
  );
}

function ExampleNotes({ notes }: { notes: string }) {
  const lines = notes
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const example = lines[0] ?? notes.trim();
  const translation = lines.length > 1 ? lines.slice(1).join(" ") : null;

  return (
    <div className="mt-6 space-y-1.5 break-words text-[14.5px] leading-relaxed [overflow-wrap:anywhere]">
      <p className="text-ink">
        {/^ex\.?\s/i.test(example) ? example : `ex. ${example}`}
      </p>
      {translation ? <p className="text-stone">{translation}</p> : null}
    </div>
  );
}

function PlayIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
      <path fill="currentColor" d="M3 1.5v9l8-4.5-8-4.5z" />
    </svg>
  );
}

async function speakFallback(text: string, language?: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  if (language === "ja") utter.lang = "ja-JP";
  else if (language === "ko") utter.lang = "ko-KR";
  else if (language === "zh") utter.lang = "zh-CN";
  // Prefer a matching system voice when available (helps Safari/iOS).
  const voices = window.speechSynthesis.getVoices();
  const match = voices.find((v) => v.lang.toLowerCase().startsWith(utter.lang.slice(0, 2)));
  if (match) utter.voice = match;
  window.speechSynthesis.speak(utter);
}
