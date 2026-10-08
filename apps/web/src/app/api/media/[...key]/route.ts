import { NextResponse } from "next/server";
import { loadMedia } from "@/lib/media";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ key: string[] }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { key } = await ctx.params;
  const filename = key.join("/");
  const file = await loadMedia(filename);
  if (!file) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(file.buf), {
    headers: {
      "Content-Type": file.contentType,
      // Short TTL so regenerated TTS (same key) reaches clients without a day-long stale CDN hit.
      "Cache-Control": "public, max-age=120, stale-while-revalidate=600",
    },
  });
}
