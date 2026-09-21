"use client";

import { useEffect, useState } from "react";
import { activeDecks, type ProposedCard } from "@quadra/shared";
import { PillButton } from "@/components/ui";
import { useQuadra } from "@/lib/store";

export function AddFlowModal({ onClose }: { onClose: () => void }) {
  const decksRaw = useQuadra((s) => s.decks);
  const upsertCard = useQuadra((s) => s.upsertCard);
  const addDeck = useQuadra((s) => s.addDeck);
  const decks = activeDecks(decksRaw);
  const [tab, setTab] = useState<"manual" | "anki" | "ai">("manual");
  const [deckId, setDeckId] = useState(decks[0]?.id ?? "");
  const [term, setTerm] = useState("");
  const [reading, setReading] = useState("");
  const [meaning, setMeaning] = useState("");
  const [notes, setNotes] = useState("");
  const [imageKey, setImageKey] = useState<string | null>(null);
  const [notesText, setNotesText] = useState("");
  const [proposals, setProposals] = useState<ProposedCard[]>([]);
  const [proposalIndex, setProposalIndex] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const current = proposals[proposalIndex];

  useEffect(() => {
    if (!deckId && decks[0]?.id) setDeckId(decks[0].id);
  }, [decks, deckId]);

  async function ensureDeck(preferredName?: string) {
    if (deckId && decks.some((d) => d.id === deckId)) return deckId;
    if (decks[0]?.id) {
      setDeckId(decks[0].id);
      return decks[0].id;
    }
    const name = (preferredName || "Anki import").replace(/\.apkg$/i, "").trim() || "Anki import";
    const id = addDeck(name, "ja");
    setDeckId(id);
    return id;
  }

  async function runAi() {
    setBusy(true);
    setStatus(null);
    try {
      const target = await ensureDeck("AI draft");
      const deck = useQuadra.getState().decks.find((d) => d.id === target);
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
    (window as unknown as { __quadraPauseSync?: boolean }).__quadraPauseSync = true;
    const beforeCount = useQuadra.getState().cards.length;
    try {
      if (!file.name.toLowerCase().endsWith(".apkg")) {
        throw new Error("Please choose an Anki .apkg file");
      }
      const target = await ensureDeck(file.name);
      const deckName =
        useQuadra.getState().decks.find((d) => d.id === target)?.name ||
        file.name.replace(/\.apkg$/i, "");
      setStatus("Importing… large decks can take a minute. You can leave this open.");

      const form = new FormData();
      form.append("file", file);
      form.append("deckId", target);
      form.append("deckName", deckName);
      const res = await fetch("/api/anki-import", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Import failed");

      const fresh = await fetch("/api/store");
      const remote = await fresh.json();
      if (remote?.decks && remote?.cards) {
        useQuadra.getState().replaceStore({
          decks: remote.decks,
          cards: remote.cards,
          reviews: remote.reviews ?? [],
          settings: remote.settings ?? useQuadra.getState().settings,
          version: remote.version ?? 3,
        });
      }
      setStatus(
        `Imported ${data.count ?? 0} cards${
          data.mediaUploaded ? ` · ${data.mediaUploaded} media files` : ""
        }`,
      );
    } catch (e) {
      // The server may have saved cards even if the browser connection dropped
      try {
        const fresh = await fetch("/api/store");
        const remote = await fresh.json();
        const n = Array.isArray(remote?.cards) ? remote.cards.length : 0;
        if (n > beforeCount && remote?.decks) {
          useQuadra.getState().replaceStore({
            decks: remote.decks,
            cards: remote.cards,
            reviews: remote.reviews ?? [],
            settings: remote.settings ?? useQuadra.getState().settings,
            version: remote.version ?? 3,
          });
          setStatus(`Import finished on the server (${n} cards). Refresh if the list looks stale.`);
          return;
        }
      } catch {
        /* ignore */
      }
      setStatus(e instanceof Error ? e.message : "Import failed");
    } finally {
      (window as unknown as { __quadraPauseSync?: boolean }).__quadraPauseSync = false;
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
      audioKey: item.audioKey ?? audioKey,
      imageKey: item.imageKey ?? null,
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
              <textarea
                placeholder="English (front) — shown first while studying"
                value={meaning}
                onChange={(e) => setMeaning(e.target.value)}
                rows={2}
                className="w-full rounded-[20px] bg-field px-4 py-3 outline-none"
              />
              <input
                placeholder="Word (back) — target language"
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
                placeholder={"Example sentence\nEnglish translation"}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full rounded-[20px] bg-field px-4 py-3 outline-none"
              />
              <label className="flex cursor-pointer items-center justify-between rounded-[20px] bg-field px-4 py-3 text-[14.5px]">
                <span className="text-stone">
                  {imageKey ? `Image attached (${imageKey})` : "Optional image"}
                </span>
                <span className="font-medium text-ink">
                  {imageKey ? "Replace" : "Upload"}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const ext = file.name.split(".").pop() || "png";
                    const filename = `img_new_${Date.now()}.${ext}`;
                    const res = await fetch("/api/media/upload", {
                      method: "POST",
                      headers: {
                        "Content-Type": file.type || "application/octet-stream",
                        "x-filename": filename,
                      },
                      body: file,
                    });
                    const data = await res.json();
                    if (res.ok) setImageKey(data.imageKey || data.key);
                    else setStatus(data.error || "Image upload failed");
                  }}
                />
              </label>
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
                    imageKey,
                    audioSource,
                  });
                  setTerm("");
                  setReading("");
                  setMeaning("");
                  setNotes("");
                  setImageKey(null);
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
                present. If you have no deck yet, one is created from the file name.
              </p>
              <input
                type="file"
                accept=".apkg,application/octet-stream"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onApkg(f);
                  e.target.value = "";
                }}
              />
              {busy ? (
                <p className="text-[13px] text-stone">Working — large decks can take a minute…</p>
              ) : null}
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
