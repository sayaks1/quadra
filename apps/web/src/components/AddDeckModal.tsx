"use client";

import { useState } from "react";
import type { Language } from "@quadra/shared";
import { PillButton } from "@/components/ui";
import { useQuadra } from "@/lib/store";

const LANGUAGES: { value: Language; label: string }[] = [
  { value: "zh", label: "Chinese" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "en", label: "English" },
  { value: "other", label: "Other" },
];

export function AddDeckModal({ onClose }: { onClose: () => void }) {
  const addDeck = useQuadra((s) => s.addDeck);
  const setRoute = useQuadra((s) => s.setRoute);
  const [name, setName] = useState("");
  const [language, setLanguage] = useState<Language>("zh");

  function create() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const id = addDeck(trimmed, language);
    setRoute({ name: "deck", deckId: id, tab: "cards" });
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/20 p-6 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-[26px] bg-card p-8 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-serif text-[34px]">New deck</h2>
          <PillButton variant="ghost" onClick={onClose}>
            Close
          </PillButton>
        </div>
        <p className="mt-2 text-[14.5px] text-stone">
          Name a deck and pick the language you&apos;ll study in it.
        </p>

        <label className="mt-6 block text-[12px] uppercase tracking-wide text-stone">
          Name
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") create();
            }}
            placeholder="e.g. Japanese vocabulary"
            className="mt-1.5 w-full rounded-full bg-field px-4 py-3 text-[14.5px] text-ink outline-none"
          />
        </label>

        <label className="mt-4 block text-[12px] uppercase tracking-wide text-stone">
          Language
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as Language)}
            className="mt-1.5 w-full rounded-full bg-field px-4 py-3 text-[14.5px] text-ink outline-none"
          >
            {LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </label>

        <div className="mt-8 flex justify-end gap-2">
          <PillButton variant="ghost" onClick={onClose}>
            Cancel
          </PillButton>
          <PillButton variant="oxblood" disabled={!name.trim()} onClick={create}>
            Create deck
          </PillButton>
        </div>
      </div>
    </div>
  );
}
