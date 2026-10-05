"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";

/**
 * Prefer the largest comfortable type size; shrink toward `minPx` to avoid
 * overflow; only allow mid-word wrapping once we're at the floor.
 */
export function FitText({
  children,
  className,
  maxPx,
  minPx = 22,
  style,
}: {
  children: ReactNode;
  className?: string;
  maxPx: number;
  minPx?: number;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [fontSize, setFontSize] = useState(maxPx);
  const [allowBreak, setAllowBreak] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const fit = () => {
      const width = el.clientWidth;
      if (width <= 0) return;

      let size = maxPx;
      el.style.fontSize = `${size}px`;
      el.style.overflowWrap = "normal";
      el.style.wordBreak = "normal";

      // Shrink while a single line/token still overflows the box.
      while (size > minPx && el.scrollWidth > width + 1) {
        size -= 1;
        el.style.fontSize = `${size}px`;
      }

      const stillOverflows = el.scrollWidth > width + 1;
      if (stillOverflows) {
        el.style.overflowWrap = "anywhere";
        el.style.wordBreak = "break-word";
      }

      setFontSize(size);
      setAllowBreak(stillOverflows);
    };

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [children, maxPx, minPx]);

  return (
    <div
      ref={ref}
      className={cn("max-w-full min-w-0", className)}
      style={{
        ...style,
        fontSize,
        overflowWrap: allowBreak ? "anywhere" : "normal",
        wordBreak: allowBreak ? "break-word" : "normal",
      }}
    >
      {children}
    </div>
  );
}

export function useStudyDisplayMaxPx(mobile = 28, desktop = 34) {
  const [maxPx, setMaxPx] = useState(mobile);

  useLayoutEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const sync = () => setMaxPx(mq.matches ? desktop : mobile);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [mobile, desktop]);

  return maxPx;
}
