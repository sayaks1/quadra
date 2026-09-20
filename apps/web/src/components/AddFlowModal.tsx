"use client";

import { useState } from "react";
import { activeDecks, type ProposedCard } from "@quadra/shared";
import { parseApkg } from "@/lib/anki";
import { PillButton } from "@/components/ui";
import { useQuadra } from "@/lib/store";

export function AddFlowModal({ onClose }: { onClose: () => void }) {
  const decks = useQuadra((s) => activeDecks(s.decks));
  const upsertCard = useQuadra((s) => s.upsertCard);
  const importCards = useQuadra((s) => s.importCards);
  const [tab, setTab] = useState<"manual" | "anki" | "ai">("manual");
  const [deckId, setDeckId] = useState(decks[0]?.id ?? "");
  const [term, setTerm] = useState("");
  const [reading, setReading] = useState("");
  const [meaning, setMeaning] = useState("");
  const [notes, setNotes] = useState("");
  const [notesText, setNotesText] = useState("");
  const [proposals, setProposals] = useState<ProposedCard[]>([]);
  const [proposalIndex, setProposalIndex] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const current = proposals[proposalIndex];

  async function runAi() {
    setBusy(true);
    setStatus(null);
    try {
      const deck = decks.find((d) => d.id === deckId);
      const res = await fetch("/api/ai-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: notesText, language: deck?.language ?? "ja" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "AI draft failed");
      setProposals(data.cards ?? []);
      setProposalIndex(0);
      setStatus(`${(data.cards ?? []).length} proposed cards`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "AI draft failed");
    } finally {
      setBusy(false);
    }
  }

  async function onApkg(file: File) {
    setBusy(true);
    setStatus(null);
    try {
      const buf = await file.arrayBuffer();
      const result = await parseApkg(buf);
      // Persist media to server when possible
      for (const [key, bytes] of Object.entries(result.media)) {
        const name = result.mediaMap[key] || key;
        await fetch("/api/media/upload", {
          method: "POST",
          headers: {
            "Content-Type": "application/octet-stream",
            "x-filename": name,
          },
          body: new Blob([bytes.buffer as ArrayBuffer]),
        }).catch(() => null);
      }
      const count = importCards(deckId, result.cards, "anki");
      setStatus(`Imported ${count} cards from Anki`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  async function acceptProposal(edit?: ProposedCard) {
    const item = edit ?? current;
    if (!item) return;
    let audioKey: string | null = null;
    let audioSource: "tts" | "none" = "none";
    try {
      const deck = decks.find((d) => d.id === deckId);
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: item.term, language: deck?.language ?? "ja" }),
      });
      if (res.ok) {
        const data = await res.json();
        audioKey = data.audioKey;
        audioSource = "tts";
      }
    } catch {
      // optional
    }
    upsertCard({
      deckId,
      term: item.term,
      reading: item.reading,
      meaning: item.meaning,
      notes: item.notes,
      audioKey,
      audioSource,
    });
    if (proposalIndex >= proposals.length - 1) {
      setProposals([]);
      setProposalIndex(0);
      setStatus("All proposals reviewed");
    } else {
      setProposalIndex((i) => i + 1);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/20 p-6 backdrop-blur-[2px]">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-[26px] bg-card p-8 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-[34px]">Add</h2>
          <PillButton variant="ghost" onClick={onClose}>
            Close
          </PillButton>
        </div>

        <div className="mt-4 flex gap-2">
          {(["manual", "anki", "ai"] as const).map((t) => (
            <PillButton
              key={t}
              variant={tab === t ? "oxblood" : "soft"}
              onClick={() => setTab(t)}
            >
              {t === "manual" ? "New card" : t === "anki" ? "Anki import" : "AI from notes"}
            </PillButton>
          ))}
        </div>

        <label className="mt-5 block text-[12px] uppercase tracking-wide text-stone">
          Deck
          <select
            value={deckId}
            onChange={(e) => setDeckId(e.target.value)}
            className="mt-1.5 w-full rounded-full bg-field px-4 py-3 text-[14.5px] text-ink outline-none"
          >
            {decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>

        <div className="mt-5 min-h-0 flex-1 overflow-auto">
          {tab === "manual" ? (
            <div className="space-y-3">
              <input
                placeholder="Term"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                className="w-full rounded-full bg-field px-4 py-3 outline-none"
              />
              <input
                placeholder="Reading"
                value={reading}
                onChange={(e) => setReading(e.target.value)}
                className="w-full rounded-full bg-field px-4 py-3 outline-none"
              />
              <textarea
                placeholder="Meaning"
                value={meaning}
                onChange={(e) => setMeaning(e.target.value)}
                rows={3}
                className="w-full rounded-[20px] bg-field px-4 py-3 outline-none"
              />
              <input
                placeholder="Notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded-full bg-field px-4 py-3 outline-none"
              />
              <PillButton
                variant="oxblood"
                disabled={!term.trim() || !meaning.trim()}
                onClick={async () => {
                  let audioKey: string | null = null;
                  let audioSource: "tts" | "none" = "none";
                  const deck = decks.find((d) => d.id === deckId);
                  try {
                    const res = await fetch("/api/tts", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        text: term,
                        language: deck?.language ?? "ja",
                      }),
                    });
                    if (res.ok) {
                      const data = await res.json();
                      audioKey = data.audioKey;
                      audioSource = "tts";
                    }
                  } catch {
                    /* browser TTS later */
                  }
                  upsertCard({
                    deckId,
                    term: term.trim(),
                    reading: reading.trim(),
                    meaning: meaning.trim(),
                    notes: notes.trim(),
                    audioKey,
                    audioSource,
                  });
                  setTerm("");
                  setReading("");
                  setMeaning("");
                  setNotes("");
                  setStatus("Card saved");
                }}
              >
                Save card
              </PillButton>
            </div>
          ) : null}

          {tab === "anki" ? (
            <div className="space-y-4">
              <p className="text-[14.5px] text-stone">
                Drop an Anki <code>.apkg</code> export. Images and audio are preserved when
                present.
              </p>
              <input
                type="file"
                accept=".apkg"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onApkg(f);
                }}
              />
            </div>
          ) : null}

          {tab === "ai" ? (
            <div className="space-y-4">
              <textarea
                value={notesText}
                onChange={(e) => setNotesText(e.target.value)}
                rows={8}
                placeholder="Paste lesson notes or PDF text…"
                className="w-full rounded-[20px] bg-field px-4 py-3 outline-none"
              />
              <PillButton
                variant="oxblood"
                disabled={busy || !notesText.trim()}
                onClick={runAi}
              >
                {busy ? "Drafting…" : "Draft vocab cards"}
              </PillButton>

              {current ? (
                <div className="rounded-[20px] bg-field p-5">
                  <p className="text-[12px] text-stone">
                    Proposal {proposalIndex + 1} of {proposals.length}
                  </p>
                  <div className="mt-2 font-serif text-[28px]">{current.term}</div>
                  <div className="text-[14.5px] text-stone">{current.reading}</div>
                  <div className="mt-2 text-[14.5px]">{current.meaning}</div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <PillButton variant="oxblood" onClick={() => void acceptProposal()}>
                      Accept + TTS
                    </PillButton>
                    <PillButton
                      variant="ghost"
                      onClick={() => {
                        if (proposalIndex >= proposals.length - 1) {
                          setProposals([]);
                          setProposalIndex(0);
                        } else setProposalIndex((i) => i + 1);
                      }}
                    >
                      Skip
                    </PillButton>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {status ? <p className="mt-4 text-[13px] text-stone">{status}</p> : null}
      </div>
    </div>
  );
}
