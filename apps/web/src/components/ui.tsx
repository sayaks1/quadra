"use client";

import { cn } from "@/lib/cn";
import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

type Variant = "oxblood" | "ink" | "ghost" | "soft";

export function PillButton({
  variant = "soft",
  className,
  children,
  ...props
}: PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }
>) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-full px-4 py-2 text-[14.5px] font-medium transition active:scale-[0.98] disabled:opacity-40",
        variant === "oxblood" && "bg-oxblood text-white",
        variant === "ink" && "bg-ink text-white",
        variant === "ghost" && "border border-stone/50 bg-card text-ink",
        variant === "soft" && "bg-field text-ink",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function QuadraMark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-grid grid-cols-2 gap-[3px]", className)} aria-hidden>
      <span className="h-1.5 w-1.5 rounded-[2px] bg-ink" />
      <span className="h-1.5 w-1.5 rounded-[2px] bg-ink" />
      <span className="h-1.5 w-1.5 rounded-[2px] bg-ink" />
      <span className="h-1.5 w-1.5 rounded-[2px] bg-ink" />
    </span>
  );
}
