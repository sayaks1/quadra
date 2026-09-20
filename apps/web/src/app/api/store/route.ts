import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const storePath = () => path.join(process.cwd(), ".data", "store.json");

export async function GET() {
  try {
    const raw = await readFile(storePath(), "utf8");
    return NextResponse.json(JSON.parse(raw));
  } catch {
    return NextResponse.json({ decks: [], cards: [], reviews: [], version: 1 });
  }
}

export async function PUT(req: Request) {
  const body = await req.json();
  await mkdir(path.dirname(storePath()), { recursive: true });
  await writeFile(storePath(), JSON.stringify(body, null, 2), "utf8");
  return NextResponse.json({ ok: true });
}
