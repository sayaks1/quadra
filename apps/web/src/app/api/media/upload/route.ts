import { NextResponse } from "next/server";
import { isImageFilename, saveMedia } from "@/lib/media";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const filename =
    req.headers.get("x-filename")?.replace(/[^\w.\-]+/g, "_") ||
    `media_${Date.now()}`;
  const contentType =
    req.headers.get("content-type") || "application/octet-stream";
  const buf = Buffer.from(await req.arrayBuffer());

  try {
    const saved = await saveMedia(filename, buf, contentType);
    const image = isImageFilename(saved.key) || contentType.startsWith("image/");
    return NextResponse.json({
      key: saved.key,
      audioKey: image ? null : saved.key,
      imageKey: image ? saved.key : null,
      backend: saved.backend,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Upload failed" },
      { status: 500 },
    );
  }
}
