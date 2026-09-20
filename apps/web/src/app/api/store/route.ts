import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import type { QuadraStore } from "@quadra/shared";
import { pullCloudStore, pushCloudStore } from "@/lib/cloud-store";
import { isCloudConfigured } from "@/lib/supabase";

export const runtime = "nodejs";

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
        // Mirror to local disk as a backup cache
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
  const body = (await req.json()) as QuadraStore;

  // Always keep a local mirror
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
