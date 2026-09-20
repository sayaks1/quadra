import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const filename =
    req.headers.get("x-filename")?.replace(/[^\w.\-]+/g, "_") ||
    `media_${Date.now()}`;
  const buf = Buffer.from(await req.arrayBuffer());
  const dir = path.join(process.cwd(), ".data", "media");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), buf);
  return NextResponse.json({ audioKey: filename, imageKey: filename });
}
