import { NextResponse } from "next/server";
import type { Card } from "@quadra/shared";
import { upsertCloudPieces } from "@/lib/cloud-store";
import { isCloudConfigured } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Upsert cards without deleting anything else in the cloud store. */
export async function POST(req: Request) {
  const body = (await req.json()) as { cards?: Card[] };
  const cards = Array.isArray(body.cards) ? body.cards : [];
  if (!cards.length) {
    return NextResponse.json({ error: "Missing cards" }, { status: 400 });
  }
  if (!isCloudConfigured()) {
    return NextResponse.json({ error: "Cloud not configured" }, { status: 503 });
  }
  try {
    await upsertCloudPieces({ cards });
    return NextResponse.json({ ok: true, upserted: cards.length, backend: "supabase" as const });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Upsert failed" },
      { status: 502 },
    );
  }
}
