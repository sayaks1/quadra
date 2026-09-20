import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ key: string[] }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { key } = await ctx.params;
  const filename = key.join("/");
  const filePath = path.join(process.cwd(), ".data", "media", filename);
  try {
    const buf = await readFile(filePath);
    const ext = path.extname(filename).toLowerCase();
    const type =
      ext === ".mp3"
        ? "audio/mpeg"
        : ext === ".json"
          ? "application/json"
          : "application/octet-stream";
    return new NextResponse(buf, {
      headers: {
        "Content-Type": type,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
