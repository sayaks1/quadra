import JSZip from "jszip";
import type { ProposedCard } from "@quadra/shared";

export interface AnkiImportResult {
  cards: ProposedCard[];
  media: Record<string, Uint8Array>;
  mediaMap: Record<string, string>;
}

function extractImageRef(html: string): string | null {
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (!m?.[1]) return null;
  const src = m[1].trim();
  // Anki often stores just the filename
  const base = src.split(/[\\/]/).pop() || src;
  return base.replace(/^api\/media\//, "");
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

  // Reverse map: filename -> anki media index key
  const nameToKey: Record<string, string> = {};
  for (const [key, name] of Object.entries(mediaMap)) {
    nameToKey[String(name)] = key;
    nameToKey[pathBasename(String(name))] = key;
  }

  const media: Record<string, Uint8Array> = {};
  await Promise.all(
    Object.keys(mediaMap).map(async (key) => {
      const f = zip.file(key);
      if (f) media[key] = await f.async("uint8array");
    }),
  );

  const dbFile =
    zip.file("collection.anki21") ||
    zip.file("collection.anki2") ||
    zip.file("collection.anki21b");

  if (!dbFile) {
    throw new Error("No Anki collection database found in .apkg");
  }

  const initSqlJs = (await import("sql.js")).default;
  const SQL = await initSqlJs({
    locateFile: (file) => `https://sql.js.org/dist/${file}`,
  });
  const bytes = await dbFile.async("uint8array");
  const db = new SQL.Database(bytes);

  const cards: ProposedCard[] = [];
  try {
    const result = db.exec("SELECT flds FROM notes");
    if (result[0]) {
      for (const row of result[0].values) {
        const rawFlds = String(row[0] ?? "");
        const rawFields = rawFlds.split("\x1f");
        const fields = rawFields.map(stripHtml);
        const term = fields[0] || "";
        const meaning = fields[1] || fields.slice(1).join(" — ");
        const reading = fields[2] || "";
        if (!term && !meaning) continue;

        let imageKey: string | null = null;
        for (const raw of rawFields) {
          const ref = extractImageRef(raw);
          if (!ref) continue;
          const mediaKey = nameToKey[ref] ?? nameToKey[pathBasename(ref)];
          const filename = mediaKey != null ? mediaMap[mediaKey] || ref : ref;
          if (/\.(png|jpe?g|gif|webp|svg)$/i.test(filename) || mediaKey != null) {
            imageKey = pathBasename(String(filename));
            break;
          }
        }

        cards.push({
          term,
          reading,
          meaning,
          notes: fields.slice(3).filter(Boolean).join("\n"),
          imageKey,
        });
      }
    }
  } finally {
    db.close();
  }

  return { cards, media, mediaMap };
}

function pathBasename(p: string) {
  return p.split(/[\\/]/).pop() || p;
}
