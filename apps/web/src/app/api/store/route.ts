import { NextResponse } from "next/server";
import type { QuadraStore } from "@quadra/shared";
import { pullCloudStore, pushCloudStore } from "@/lib/cloud-store";
import { readLocalStore, writeLocalStore } from "@/lib/local-store";
import { isCloudConfigured } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (isCloudConfigured()) {
    try {
      const cloud = await pullCloudStore();
      if (cloud) {
        await writeLocalStore(cloud);
        return NextResponse.json({ ...cloud, backend: "supabase" as const });
      }
    } catch (e) {
      const local = await readLocalStore();
      return NextResponse.json({
        ...(local ?? { decks: [], cards: [], reviews: [], version: 3 }),
        backend: "local" as const,
        cloudError: e instanceof Error ? e.message : "Cloud pull failed",
      });
    }
  }

  const local = await readLocalStore();
  return NextResponse.json({
    ...(local ?? { decks: [], cards: [], reviews: [], version: 3 }),
    backend: "local" as const,
  });
}

export async function PUT(req: Request) {
  const body = (await req.json()) as QuadraStore & { force?: boolean };
  const force =
    body.force === true || req.headers.get("x-quadra-force") === "1";

  const incomingCards = Array.isArray(body.cards) ? body.cards.length : 0;
  const incomingDecks = Array.isArray(body.decks) ? body.decks.length : 0;

  let toWrite: QuadraStore = body;

  // Guard: never let a blank/partial browser tab wipe a populated cloud store
  // (common right after Anki import when local state is still empty).
  if (!force && isCloudConfigured()) {
    try {
      const cloud = await pullCloudStore();
      const cloudCards = cloud?.cards?.length ?? 0;
      const cloudDecks = cloud?.decks?.length ?? 0;
      if (cloudCards > 0 && incomingCards === 0) {
        return NextResponse.json(
          {
            ok: false,
            skipped: true,
            reason: "refusing to overwrite cloud cards with an empty store",
            backend: "supabase" as const,
            cloudCards,
          },
          { status: 409 },
        );
      }
      if (cloudCards > 0 && incomingCards < cloudCards * 0.5 && incomingDecks <= cloudDecks) {
        return NextResponse.json(
          {
            ok: false,
            skipped: true,
            reason: "refusing to shrink cloud store by more than 50% without force",
            backend: "supabase" as const,
            cloudCards,
            incomingCards,
          },
          { status: 409 },
        );
      }
      // Prefer regenerated TTS / filled sides over stale client copies.
      if (cloud?.cards?.length && Array.isArray(body.cards)) {
        toWrite = {
          ...body,
          cards: mergePreferCardFields(body.cards, cloud.cards),
        };
      }
    } catch {
      // If we can't read cloud, fall through and write at least
    }
  }

  if (isCloudConfigured()) {
    try {
      // Only hard-prune on explicit force snapshots; normal syncs must not
      // delete cards the client simply hasn't pulled yet.
      await pushCloudStore(toWrite, { pruneMissing: force });
      await writeLocalStore(toWrite);
      return NextResponse.json({ ok: true, backend: "supabase" as const });
    } catch (e) {
      return NextResponse.json(
        {
          ok: false,
          backend: "local" as const,
          cloudError: e instanceof Error ? e.message : "Cloud push failed",
        },
        { status: 502 },
      );
    }
  }

  await writeLocalStore(toWrite);
  return NextResponse.json({ ok: true, backend: "local" as const });
}

/** Keep better audio keys and refuse blank term/meaning overwrites from stale tabs. */
function mergePreferCardFields(
  incoming: QuadraStore["cards"],
  cloud: QuadraStore["cards"],
): QuadraStore["cards"] {
  const cloudById = new Map(cloud.map((c) => [c.id, c]));
  const incomingIds = new Set(incoming.map((c) => c.id));
  const merged = incoming.map((card) => {
    const remote = cloudById.get(card.id);
    if (!remote) return card;
    const nextKey = preferAudioKey(card.audioKey, remote.audioKey);
    const term = preferFilledText(card.term, remote.term);
    const meaning = preferFilledText(card.meaning, remote.meaning);
    const notes = preferNotesText(card.notes, remote.notes);
    const reading = preferFilledText(card.reading, remote.reading);
    if (
      nextKey === (card.audioKey ?? null) &&
      term === card.term &&
      meaning === card.meaning &&
      notes === card.notes &&
      reading === card.reading
    ) {
      return card;
    }
    return {
      ...card,
      term,
      meaning,
      notes,
      reading,
      audioKey: nextKey,
      audioSource: nextKey
        ? card.audioSource || remote.audioSource || "tts"
        : card.audioSource,
    };
  });
  // Preserve cards the client doesn't have yet (imports from another session/device).
  for (const remote of cloud) {
    if (!incomingIds.has(remote.id) && !remote.deletedAt) {
      merged.push(remote);
    }
  }
  return merged;
}

function preferFilledText(incoming: string, remote: string): string {
  const a = (incoming ?? "").trim();
  const b = (remote ?? "").trim();
  if (!a && b) return remote;
  return incoming;
}

/** True when notes already have a dedicated pinyin line under the Chinese example. */
function hasPinyinLine(notes: string): boolean {
  const lines = notes
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return false;
  const py = lines[1] ?? "";
  if (/[\u4e00-\u9fff]/.test(py)) return false;
  return /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü]/.test(py);
}

function preferNotesText(incoming: string, remote: string): string {
  const a = (incoming ?? "").trim();
  const b = (remote ?? "").trim();
  if (!a && b) return remote;
  if (!b) return incoming;
  // Prefer structured example + pinyin line over one-line notes that only
  // tuck pinyin into parentheses (stale tabs often look "filled" otherwise).
  const aLine = hasPinyinLine(a);
  const bLine = hasPinyinLine(b);
  if (bLine && !aLine) return remote;
  return incoming;
}

function preferAudioKey(
  incoming: string | null | undefined,
  remote: string | null | undefined,
): string | null {
  const a = incoming?.trim() || null;
  const b = remote?.trim() || null;
  if (!a) return b;
  if (!b) return a;
  if (a === b) return a;
  const score = (key: string) => {
    if (key.startsWith("rec")) return 60; // user recording always wins
    // Prefer higher TTS regeneration versions (v3 > v2 > unversioned).
    const ver = key.match(/^tts_(?:ja|ko|zh)_v(\d+)_/);
    if (ver) return 40 + Math.min(Number(ver[1]), 20);
    if (key.startsWith("tts_")) return 20;
    return 10;
  };
  // If scores tie, prefer incoming (client just changed it).
  return score(b) > score(a) ? b : a;
}
