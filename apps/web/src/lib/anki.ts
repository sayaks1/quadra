import JSZip from "jszip";
import type { ProposedCard } from "@quadra/shared";

export interface AnkiImportResult {
  cards: ProposedCard[];
  media: Record<string, Uint8Array>;
  mediaMap: Record<string, string>;
}

function stripHtml(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

export async function parseApkg(file: ArrayBuffer): Promise<AnkiImportResult> {
  const zip = await JSZip.loadAsync(file);
  const mediaFile = zip.file("media");
  let mediaMap: Record<string, string> = {};
  if (mediaFile) {
    try {
      mediaMap = JSON.parse(await mediaFile.async("string"));
    } catch {
      mediaMap = {};
    }
  }

  const media: Record<string, Uint8Array> = {};
  await Promise.all(
    Object.keys(mediaMap).map(async (key) => {
      const f = zip.file(key);
      if (f) media[key] = await f.async("uint8array");
    }),
  );

  // Prefer collection.anki21, fall back to collection.anki2
  const dbFile =
    zip.file("collection.anki21") ||
    zip.file("collection.anki2") ||
    zip.file("collection.anki21b");

  if (!dbFile) {
    throw new Error("No Anki collection database found in .apkg");
  }

  // Dynamic import sql.js
  const initSqlJs = (await import("sql.js")).default;
  const SQL = await initSqlJs({
    locateFile: (file) => `https://sql.js.org/dist/${file}`,
  });
  const bytes = await dbFile.async("uint8array");
  const db = new SQL.Database(bytes);

  const cards: ProposedCard[] = [];
  try {
    // notes: id, guid, mid, mod, usn, tags, flds, sfld, csum, flags, data
    const result = db.exec("SELECT flds FROM notes");
    if (result[0]) {
      for (const row of result[0].values) {
        const flds = String(row[0] ?? "");
        const fields = flds.split("\x1f").map(stripHtml);
        const term = fields[0] || "";
        const meaning = fields[1] || fields.slice(1).join(" — ");
        const reading = fields[2] || "";
        if (!term && !meaning) continue;
        cards.push({
          term,
          reading,
          meaning,
          notes: fields.slice(3).filter(Boolean).join("\n"),
        });
      }
    }
  } finally {
    db.close();
  }

  return { cards, media, mediaMap };
}
