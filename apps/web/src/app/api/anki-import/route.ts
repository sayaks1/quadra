import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import initSqlJs from "sql.js";
import { parseApkgWithSql } from "@/lib/anki";
import { isImageFilename, saveMedia } from "@/lib/media";

export const runtime = "nodejs";
export const maxDuration = 60;

function contentTypeFor(name: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".ogg")) return "audio/ogg";
  if (lower.endsWith(".m4a")) return "audio/mp4";
  return "application/octet-stream";
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing .apkg file" }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const wasmPath = path.join(process.cwd(), "public", "sql-wasm.wasm");
    const wasmFile = await readFile(wasmPath);
    const wasmBinary = wasmFile.buffer.slice(
      wasmFile.byteOffset,
      wasmFile.byteOffset + wasmFile.byteLength,
    );
    const SQL = await initSqlJs({ wasmBinary });

    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const result = await parseApkgWithSql(ab, SQL);

    // Upload media; rewrite keys to saved filenames
    const uploaded = new Map<string, string>();
    for (const [key, bytes] of Object.entries(result.media)) {
      const name = path.basename(String(result.mediaMap[key] || key));
      const type = contentTypeFor(name);
      try {
        const saved = await saveMedia(name, Buffer.from(bytes), type);
        uploaded.set(name, saved.key);
        uploaded.set(path.basename(name), saved.key);
      } catch {
        // continue without this media file
      }
    }

    const cards = result.cards.map((c) => ({
      ...c,
      imageKey: c.imageKey
        ? uploaded.get(c.imageKey) || uploaded.get(path.basename(c.imageKey)) || c.imageKey
        : null,
      audioKey: c.audioKey
        ? uploaded.get(c.audioKey) || uploaded.get(path.basename(c.audioKey)) || c.audioKey
        : null,
    }));

    return NextResponse.json({
      ok: true,
      count: cards.length,
      cards,
      mediaUploaded: uploaded.size,
      filename: file.name,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
