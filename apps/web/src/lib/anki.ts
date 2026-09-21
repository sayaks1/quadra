import JSZip from "jszip";
import type { ProposedCard } from "@quadra/shared";

export interface AnkiImportResult {
  cards: ProposedCard[];
  media: Record<string, Uint8Array>;
  mediaMap: Record<string, string>;
}

type SqlJsStatic = {
  Database: new (data?: ArrayLike<number>) => {
    exec: (sql: string) => Array<{ values: unknown[][] }>;
    close: () => void;
  };
};

function extractImageRef(html: string): string | null {
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (!m?.[1]) return null;
  const src = m[1].trim();
  const base = src.split(/[\\/]/).pop() || src;
  return base.replace(/^api\/media\//, "");
}

function extractAudioRef(html: string): string | null {
  const m =
    html.match(/\[sound:([^\]]+)\]/i) ||
    html.match(/<(?:audio|source)[^>]+src=["']([^"']+)["']/i);
  if (!m?.[1]) return null;
  return pathBasename(m[1].trim());
}

function stripHtml(html: string) {
  return html
    .replace(/\[sound:[^\]]+\]/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function pathBasename(p: string) {
  return p.split(/[\\/]/).pop() || p;
}

/** Shared .apkg parser — pass a ready sql.js module (browser or Node). */
export async function parseApkgWithSql(
  file: ArrayBuffer,
  SQL: SqlJsStatic,
): Promise<AnkiImportResult> {
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

  // Newer Anki may only ship collection.anki21b (zstd) — try common names
  const dbFile =
    zip.file("collection.anki21") ||
    zip.file("collection.anki2") ||
    zip.file("collection.anki21b");

  if (!dbFile) {
    const names = Object.keys(zip.files).slice(0, 20).join(", ");
    throw new Error(
      `No Anki collection database found in .apkg (saw: ${names || "empty"})`,
    );
  }

  const bytes = await dbFile.async("uint8array");
  // collection.anki21b is zstd-compressed; detect magic
  if (dbFile.name.endsWith("anki21b") || isZstd(bytes)) {
    throw new Error(
      "This .apkg uses a compressed Anki 23+ database (anki21b). Re-export from Anki with “Support older Anki versions” enabled, or export as .anki2-compatible package.",
    );
  }

  const db = new SQL.Database(bytes);
  const cards: ProposedCard[] = [];
  try {
    const result = db.exec("SELECT flds FROM notes");
    if (result[0]) {
      for (const row of result[0].values) {
        const rawFlds = String(row[0] ?? "");
        const rawFields = rawFlds.split("\x1f");
        const fields = rawFields.map(stripHtml);

        // Prefer English-looking field as meaning when present
        let term = fields[0] || "";
        let meaning = fields[1] || fields.slice(1).join(" — ");
        let reading = fields[2] || "";
        // Many JP decks: Expression / Meaning / Reading
        if (!term && !meaning) continue;

        let imageKey: string | null = null;
        let audioKey: string | null = null;
        for (const raw of rawFields) {
          if (!imageKey) {
            const ref = extractImageRef(raw);
            if (ref) {
              const mediaKey = nameToKey[ref] ?? nameToKey[pathBasename(ref)];
              const filename = mediaKey != null ? mediaMap[mediaKey] || ref : ref;
              if (
                /\.(png|jpe?g|gif|webp|svg)$/i.test(filename) ||
                mediaKey != null
              ) {
                imageKey = pathBasename(String(filename));
              }
            }
          }
          if (!audioKey) {
            const aref = extractAudioRef(raw);
            if (aref) {
              const mediaKey = nameToKey[aref] ?? nameToKey[pathBasename(aref)];
              const filename = mediaKey != null ? mediaMap[mediaKey] || aref : aref;
              if (/\.(mp3|ogg|wav|m4a|opus)$/i.test(filename) || mediaKey != null) {
                audioKey = pathBasename(String(filename));
              }
            }
          }
        }

        cards.push({
          term,
          reading,
          meaning,
          notes: fields.slice(3).filter(Boolean).join("\n"),
          imageKey,
          audioKey,
        });
      }
    }
  } finally {
    db.close();
  }

  if (cards.length === 0) {
    throw new Error("No notes found in this .apkg");
  }

  return { cards, media, mediaMap };
}

function isZstd(bytes: Uint8Array) {
  // zstd magic: 28 B5 2F FD
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x28 &&
    bytes[1] === 0xb5 &&
    bytes[2] === 0x2f &&
    bytes[3] === 0xfd
  );
}

/** Browser entry — loads sql.js WASM from same origin (/sql-wasm.wasm). */
export async function parseApkg(file: ArrayBuffer): Promise<AnkiImportResult> {
  const initSqlJs = (await import("sql.js")).default;
  const SQL = await initSqlJs({
    locateFile: (file) => {
      if (file.endsWith(".wasm")) return "/sql-wasm.wasm";
      return `/${file}`;
    },
  });
  return parseApkgWithSql(file, SQL as SqlJsStatic);
}
