"use client";

import { formatInterval, previewIntervals, type Card, type Rating } from "@quadra/shared";
import { cn } from "@/lib/cn";
import { useQuadra } from "@/lib/store";

const labels: { key: Rating; label: string }[] = [
  { key: "again", label: "Again" },
  { key: "hard", label: "Hard" },
  { key: "good", label: "Good" },
  { key: "easy", label: "Easy" },
];

export function RatingBar({
  card,
  onRate,
  round = false,
  showKeys = false,
}: {
  card: Card;
  onRate: (rating: Rating) => void;
  round?: boolean;
  showKeys?: boolean;
}) {
  const config = useQuadra((s) => s.settings.anki);
  const now = new Date();
  const intervals = previewIntervals(card, now, config);
  const keyByRating: Record<Rating, string> = {
    again: "j",
    hard: "k",
    good: "l",
    easy: ";",
  };

  return (
    <div className={cn("grid grid-cols-4 gap-2", round && "gap-3")}>
      {labels.map(({ key, label }) => {
        const text = formatInterval(now, new Date(intervals[key]));
        const primary = key === "good";
        return (
          <button
            key={key}
            type="button"
            onClick={() => onRate(key)}
            className={cn(
              "flex flex-col items-center justify-center transition active:scale-[0.97]",
              round
                ? "h-[72px] w-[72px] rounded-full"
                : "rounded-full px-3 py-3",
              primary ? "bg-oxblood text-white" : "bg-card text-ink shadow-sm",
            )}
          >
            {showKeys ? (
              <span
                className={cn(
                  "mb-0.5 text-[11px] font-medium",
                  primary ? "text-white/70" : "text-stone",
                )}
              >
                {keyByRating[key]}
              </span>
            ) : null}
            {round ? (
              <>
                <span className="text-[13px] font-medium">{label}</span>
                <span className={cn("text-[11px]", primary ? "text-white/80" : "text-stone")}>
                  {text}
                </span>
              </>
            ) : (
              <>
                <span className={cn("text-[12px]", primary ? "text-white/80" : "text-stone")}>
                  {text}
                </span>
                <span className="text-[14.5px] font-medium">{label}</span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}
