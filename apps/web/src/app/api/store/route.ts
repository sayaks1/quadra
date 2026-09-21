import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import type { QuadraStore } from "@quadra/shared";
import { pullCloudStore, pushCloudStore } from "@/lib/cloud-store";
import { isCloudConfigured } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const storePath = () => path.join(process.cwd(), ".data", "store.json");

async function readLocal(): Promise<QuadraStore | null> {
  try {
    const raw = await readFile(storePath(), "utf8");
    return JSON.parse(raw) as QuadraStore;
  } catch {
    return null;
  }
}

async function writeLocal(body: QuadraStore) {
  await mkdir(path.dirname(storePath()), { recursive: true });
  await writeFile(storePath(), JSON.stringify(body, null, 2), "utf8");
}

export async function GET() {
  if (isCloudConfigured()) {
    try {
      const cloud = await pullCloudStore();
      if (cloud) {
        await writeLocal(cloud).catch(() => null);
        return NextResponse.json({ ...cloud, backend: "supabase" as const });
      }
    } catch (e) {
      const local = await readLocal();
      return NextResponse.json({
        ...(local ?? { decks: [], cards: [], reviews: [], version: 3 }),
        backend: "local" as const,
        cloudError: e instanceof Error ? e.message : "Cloud pull failed",
      });
    }
  }

  const local = await readLocal();
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
    } catch {
      // If we can't read cloud, fall through and write local at least
    }
  }

  await writeLocal(body);

  if (isCloudConfigured()) {
    try {
      await pushCloudStore(body);
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

  return NextResponse.json({ ok: true, backend: "local" as const });
}
