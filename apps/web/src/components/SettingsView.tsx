"use client";

import { DEFAULT_ANKI_CONFIG } from "@quadra/shared";
import { PillButton } from "@/components/ui";
import { useQuadra } from "@/lib/store";

function formatSteps(seconds: number[]) {
  return seconds
    .map((s) => {
      if (s < 60) return `${s}s`;
      if (s < 3600) return `${Math.round(s / 60)}m`;
      if (s < 86400) return `${Math.round(s / 3600)}h`;
      return `${Math.round(s / 86400)}d`;
    })
    .join(" ");
}

function parseSteps(input: string): number[] | null {
  const parts = input.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  const out: number[] = [];
  for (const p of parts) {
    const m = p.match(/^(\d+(?:\.\d+)?)(s|m|h|d)?$/i);
    if (!m) return null;
    const n = Number(m[1]);
    const unit = (m[2] || "m").toLowerCase();
    const mult = unit === "s" ? 1 : unit === "m" ? 60 : unit === "h" ? 3600 : 86400;
    out.push(Math.round(n * mult));
  }
  return out;
}

export function SettingsView() {
  const settings = useQuadra((s) => s.settings);
  const updateSettings = useQuadra((s) => s.updateSettings);
  const resetDemo = useQuadra((s) => s.resetDemo);
  const setRoute = useQuadra((s) => s.setRoute);
  const syncStatus = useQuadra((s) => s.syncStatus);
  const syncBackend = useQuadra((s) => s.syncBackend);
  const anki = settings.anki;

  return (
    <div className="flex h-full flex-col p-8">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="font-serif text-[40px] font-normal tracking-tight">Settings</h1>
          <p className="mt-2 text-[14.5px] text-stone">
            Anki-style SM-2 scheduling with learning steps
          </p>
        </div>
        <PillButton variant="ghost" onClick={() => setRoute({ name: "today" })}>
          Done
        </PillButton>
      </div>

      <div className="max-w-xl space-y-6">
        <section className="rounded-[20px] bg-card p-6 shadow-sm">
          <h2 className="text-[14.5px] font-medium">Cloud sync</h2>
          <p className="mt-1 text-[12px] text-stone">
            {syncBackend === "supabase"
              ? "Connected to Supabase. Decks, cards, reviews, and media sync through the server."
              : "Running locally. Add Supabase keys to apps/web/.env.local and run the migrations in supabase/migrations to enable cloud sync."}
          </p>
          <p className="mt-3 text-[13px]">
            Status:{" "}
            <span className="font-medium">
              {syncBackend === "supabase" ? "Supabase" : "Local file"} · {syncStatus}
            </span>
          </p>
        </section>

        <section className="rounded-[20px] bg-card p-6 shadow-sm">
          <h2 className="text-[14.5px] font-medium">Learning steps</h2>
          <p className="mt-1 text-[12px] text-stone">
            Delays before a new card graduates (e.g. <code>1m 10m</code>). Again restarts at the
            first step; Good advances; Easy graduates immediately.
          </p>
          <input
            className="mt-3 w-full rounded-full bg-field px-4 py-3 outline-none"
            defaultValue={formatSteps(anki.learningSteps)}
            key={anki.learningSteps.join("-")}
            onBlur={(e) => {
              const parsed = parseSteps(e.target.value);
              if (parsed) updateSettings({ anki: { learningSteps: parsed } });
            }}
          />
        </section>

        <section className="rounded-[20px] bg-card p-6 shadow-sm">
          <h2 className="text-[14.5px] font-medium">Relearning steps</h2>
          <p className="mt-1 text-[12px] text-stone">
            After Again on a review card (e.g. <code>10m</code>).
          </p>
          <input
            className="mt-3 w-full rounded-full bg-field px-4 py-3 outline-none"
            defaultValue={formatSteps(anki.relearningSteps)}
            key={`r-${anki.relearningSteps.join("-")}`}
            onBlur={(e) => {
              const parsed = parseSteps(e.target.value);
              if (parsed) updateSettings({ anki: { relearningSteps: parsed } });
            }}
          />
        </section>

        <section className="grid grid-cols-2 gap-3">
          <NumberField
            label="Graduating interval (days)"
            value={anki.graduatingInterval}
            onChange={(v) => updateSettings({ anki: { graduatingInterval: v } })}
          />
          <NumberField
            label="Easy interval (days)"
            value={anki.easyInterval}
            onChange={(v) => updateSettings({ anki: { easyInterval: v } })}
          />
          <NumberField
            label="Starting ease"
            value={anki.startingEase}
            step={0.05}
            onChange={(v) => updateSettings({ anki: { startingEase: v } })}
          />
          <NumberField
            label="Interval modifier"
            value={anki.intervalModifier}
            step={0.05}
            onChange={(v) => updateSettings({ anki: { intervalModifier: v } })}
          />
          <NumberField
            label="Learn ahead (minutes)"
            value={Math.round(anki.learnAheadSeconds / 60)}
            onChange={(v) =>
              updateSettings({ anki: { learnAheadSeconds: Math.max(0, v) * 60 } })
            }
          />
        </section>

        <div className="flex flex-wrap gap-2">
          <PillButton
            variant="ghost"
            onClick={() =>
              updateSettings({
                anki: {
                  ...DEFAULT_ANKI_CONFIG,
                  learningSteps: [...DEFAULT_ANKI_CONFIG.learningSteps],
                  relearningSteps: [...DEFAULT_ANKI_CONFIG.relearningSteps],
                },
              })
            }
          >
            Reset to Anki defaults
          </PillButton>
          <PillButton
            variant="ghost"
            className="text-oxblood"
            onClick={() => {
              if (window.confirm("Reset all decks to demo seed data?")) resetDemo();
            }}
          >
            Reset demo data
          </PillButton>
        </div>
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <label className="rounded-[20px] bg-card p-5 shadow-sm">
      <span className="block text-[12px] text-stone">{label}</span>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full bg-transparent font-serif text-[28px] outline-none"
      />
    </label>
  );
}
