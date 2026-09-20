import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { text, language } = (await req.json()) as {
    text?: string;
    language?: string;
  };
  if (!text?.trim()) {
    return NextResponse.json({ error: "Missing text" }, { status: 400 });
  }

  const key = process.env.OPENAI_API_KEY;
  const mediaDir = path.join(process.cwd(), ".data", "media");
  await mkdir(mediaDir, { recursive: true });

  if (!key) {
    // Mock: return a tiny silent-ish wav placeholder marker; client can fall back to speechSynthesis
    const id = `tts_mock_${Date.now()}`;
    await writeFile(
      path.join(mediaDir, `${id}.json`),
      JSON.stringify({ text, language, mock: true }),
      "utf8",
    );
    return NextResponse.json({
      audioKey: id,
      mock: true,
      message: "OPENAI_API_KEY not set — use browser speech or record your voice.",
    });
  }

  const voice =
    language === "ko" ? "alloy" : language === "zh" ? "nova" : "alloy";

  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini-tts",
      voice,
      input: text,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: err || "TTS failed" }, { status: 500 });
  }

  const buf = Buffer.from(await res.arrayBuffer());
  const id = `tts_${Date.now()}`;
  await writeFile(path.join(mediaDir, `${id}.mp3`), buf);
  return NextResponse.json({ audioKey: `${id}.mp3`, mock: false });
}
