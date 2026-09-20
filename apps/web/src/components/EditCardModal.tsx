"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { Card } from "@quadra/shared";
import { activeDecks } from "@quadra/shared";
import { PillButton } from "@/components/ui";
import { useQuadra } from "@/lib/store";

export function EditCardModal({
  card,
  onClose,
}: {
  card: Card | null;
  onClose: () => void;
}) {
  const decksRaw = useQuadra((s) => s.decks);
  const upsertCard = useQuadra((s) => s.upsertCard);
  const deleteCard = useQuadra((s) => s.deleteCard);
  const decks = activeDecks(decksRaw);

  const [term, setTerm] = useState("");
  const [reading, setReading] = useState("");
  const [meaning, setMeaning] = useState("");
  const [notes, setNotes] = useState("");
  const [deckId, setDeckId] = useState("");
  const [audioKey, setAudioKey] = useState<string | null>(null);
  const [audioSource, setAudioSource] = useState<Card["audioSource"]>("none");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!card) return;
    setTerm(card.term);
    setReading(card.reading);
    setMeaning(card.meaning);
    setNotes(card.notes);
    setDeckId(card.deckId);
    setAudioKey(card.audioKey ?? null);
    setAudioSource(card.audioSource);
    setError(null);
  }, [card]);

  if (!card) return null;

  async function generateTts() {
    setBusy(true);
    setError(null);
    try {
      const deck = decks.find((d) => d.id === deckId);
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: term, language: deck?.language ?? "ja" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "TTS failed");
      setAudioKey(data.audioKey);
      setAudioSource("tts");
    } catch (e) {
      setError(e instanceof Error ? e.message : "TTS failed");
    } finally {
      setBusy(false);
    }
  }

  async function recordOverride() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => chunks.push(e.data);
      const done = new Promise<Blob>((resolve) => {
        recorder.onstop = () => resolve(new Blob(chunks, { type: "audio/webm" }));
      });
      recorder.start();
      await new Promise((r) => setTimeout(r, 1800));
      recorder.stop();
      stream.getTracks().forEach((t) => t.stop());
      const blob = await done;
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve) => {
        reader.onloadend = () => resolve(String(reader.result));
        reader.readAsDataURL(blob);
      });
      setAudioKey(dataUrl);
      setAudioSource("user");
    } catch {
      setError("Microphone unavailable — use TTS or try again.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/20 p-6 backdrop-blur-[2px]">
      <div className="w-full max-w-lg rounded-[26px] bg-card p-8 shadow-xl">
        <h2 className="font-serif text-[34px]">Edit card</h2>
        <div className="mt-6 space-y-4">
          <Field label="Front">
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              className="w-full rounded-full bg-field px-4 py-3 outline-none"
            />
          </Field>
          <Field label="Reading">
            <input
              value={reading}
              onChange={(e) => setReading(e.target.value)}
              className="w-full rounded-full bg-field px-4 py-3 outline-none"
            />
          </Field>
          <Field label="Back">
            <textarea
              value={meaning}
              onChange={(e) => setMeaning(e.target.value)}
              rows={3}
              className="w-full rounded-[20px] bg-field px-4 py-3 outline-none"
            />
          </Field>
          <Field label="Notes">
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-full bg-field px-4 py-3 outline-none"
            />
          </Field>
          <Field label="Deck">
            <select
              value={deckId}
              onChange={(e) => setDeckId(e.target.value)}
              className="w-full rounded-full bg-field px-4 py-3 outline-none"
            >
              {decks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex flex-wrap gap-2">
            <PillButton variant="soft" disabled={busy || !term} onClick={generateTts}>
              {busy ? "Generating…" : "Generate AI voice"}
            </PillButton>
            <PillButton variant="ghost" onClick={recordOverride}>
              Record my voice
            </PillButton>
            {audioKey ? (
              <PillButton
                variant="ghost"
                onClick={() => {
                  const url = audioKey.startsWith("data:")
                    ? audioKey
                    : `/api/media/${audioKey}`;
                  void new Audio(url).play();
                }}
              >
                Preview ({audioSource})
              </PillButton>
            ) : null}
          </div>
          {error ? <p className="text-[13px] text-oxblood">{error}</p> : null}
        </div>
        <div className="mt-8 flex items-center justify-between gap-2">
          <PillButton
            variant="ghost"
            className="text-oxblood"
            onClick={() => {
              deleteCard(card.id);
              onClose();
            }}
          >
            Delete
          </PillButton>
          <div className="flex gap-2">
            <PillButton variant="ghost" onClick={onClose}>
              Cancel
            </PillButton>
            <PillButton
              variant="oxblood"
              onClick={() => {
                upsertCard({
                  id: card.id,
                  deckId,
                  term: term.trim(),
                  reading: reading.trim(),
                  meaning: meaning.trim(),
                  notes: notes.trim(),
                  audioKey,
                  audioSource,
                });
                onClose();
              }}
            >
              Save card
            </PillButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] uppercase tracking-wide text-stone">
        {label}
      </span>
      {children}
    </label>
  );
}
