"use client";

import { useEffect, useMemo, useState } from "react";
import { deckStats, type Card } from "@quadra/shared";
import { RatingBar } from "@/components/RatingBar";
import { PillButton } from "@/components/ui";
import { useQuadra } from "@/lib/store";

export function StudyView({ deckId }: { deckId?: string }) {
  const cards = useQuadra((s) => s.cards);
  const decks = useQuadra((s) => s.decks);
  const getDue = useQuadra((s) => s.getDue);
  const rateCard = useQuadra((s) => s.rateCard);
  const setRoute = useQuadra((s) => s.setRoute);

  const [queue, setQueue] = useState<Card[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  const [startedAt] = useState(() => Date.now());

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.code === "Space" && !revealed) {
        e.preventDefault();
        setRevealed(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [revealed]);

  useEffect(() => {
    setQueue(getDue(deckId));
    setRevealed(false);
    setDoneCount(0);
  }, [deckId, getDue, cards.length]);

  const current = queue[0];
  const deck = decks.find((d) => d.id === (deckId || current?.deckId));
  const stats = deck ? deckStats(cards, deck.id) : null;
  const totalSession = doneCount + queue.length;
  const progress = totalSession === 0 ? 1 : doneCount / totalSession;

  const audioUrl = useMemo(() => {
    if (!current?.audioKey) return null;
    if (current.audioKey.startsWith("blob:") || current.audioKey.startsWith("data:")) {
      return current.audioKey;
    }
    return `/api/media/${current.audioKey}`;
  }, [current]);

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
    <div className="flex h-full flex-col p-8">
      <div className="mb-4">
        <div className="mb-3 h-[3px] overflow-hidden rounded-full bg-stone/30">
          <div
            className="h-full rounded-full bg-oxblood transition-all"
            style={{ width: `${Math.max(6, progress * 100)}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-[14.5px]">
          <span className="font-medium">{deck?.name ?? "All decks"}</span>
          <span className="text-stone">
            {stats
              ? `${stats.neu} new · ${stats.learning} learning · ${queue.length} due`
              : `${queue.length} left`}
          </span>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center">
        <div className="rounded-[20px] bg-card px-8 py-10 shadow-sm">
          <div className="mb-8 flex items-center justify-between text-[12px] text-stone">
            <span>
              {current.fsrs.state === "new" && current.fsrs.reps === 0
                ? "New"
                : `Review · seen ${current.fsrs.reps} times`}
            </span>
            <button
              type="button"
              className="hover:text-ink"
              onClick={() => {
                if (audioUrl) {
                  void new Audio(audioUrl).play();
                } else {
                  void speakFallback(current.term, deck?.language);
                }
              }}
            >
              Play audio
            </button>
          </div>
          <div className="font-serif text-[34px] leading-snug">{current.term}</div>
          {current.reading ? (
            <div className="mt-2 text-[14.5px] text-stone">{current.reading}</div>
          ) : null}
          {revealed ? (
            <>
              <div className="my-8 h-px bg-stone/30" />
              <div className="font-serif text-[20px] leading-relaxed text-ink">
                {current.reading ? `${current.reading} — ` : ""}
                {current.meaning}
                {current.notes ? `. ${current.notes}` : ""}
              </div>
            </>
          ) : null}
        </div>

        <div className="mt-6">
          {!revealed ? (
            <div>
              <PillButton
                variant="ink"
                className="w-full py-3.5"
                onClick={() => setRevealed(true)}
              >
                Show answer
              </PillButton>
              <div className="mt-4 flex justify-center gap-4 text-[12px] text-stone">
                <span>
                  <kbd className="rounded bg-card px-1.5 py-0.5">Space</kbd> reveal
                </span>
                <span>
                  <kbd className="rounded bg-card px-1.5 py-0.5">Esc</kbd> exit
                </span>
              </div>
            </div>
          ) : (
            <RatingBar
              card={current}
              onRate={(rating) => {
                rateCard(current.id, rating);
                setQueue((q) => q.slice(1));
                setDoneCount((n) => n + 1);
                setRevealed(false);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

async function speakFallback(text: string, language?: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const utter = new SpeechSynthesisUtterance(text);
  if (language === "ja") utter.lang = "ja-JP";
  else if (language === "ko") utter.lang = "ko-KR";
  else if (language === "zh") utter.lang = "zh-CN";
  window.speechSynthesis.speak(utter);
}
