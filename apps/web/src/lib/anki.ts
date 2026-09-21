import JSZip from "jszip";
import { decompress as decompressZstd } from "fzstd";
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
  options?: { loadMedia?: boolean },
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
  if (options?.loadMedia !== false) {
    await Promise.all(
      Object.keys(mediaMap).map(async (key) => {
        const f = zip.file(key);
        if (f) media[key] = await f.async("uint8array");
      }),
    );
  }

  const opened = await openBestCollection(zip, SQL);
  const cards: ProposedCard[] = [];
  const db = opened.db;
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
        if (UPGRADE_STUB.test(term) || UPGRADE_STUB.test(rawFlds)) continue;

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
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x28 &&
    bytes[1] === 0xb5 &&
    bytes[2] === 0x2f &&
    bytes[3] === 0xfd
  );
}

const UPGRADE_STUB = /please update to the latest anki version/i;

async function openBestCollection(zip: JSZip, SQL: SqlJsStatic) {
  const names = Object.keys(zip.files).filter((name) =>
    /collection\.anki2(1b?)?$/i.test(name.split("/").pop() || name),
  );
  if (!names.length) {
    const sample = Object.keys(zip.files).slice(0, 12).join(", ");
    throw new Error(`No Anki collection database found in .apkg (saw: ${sample || "empty"})`);
  }

  let best: { db: InstanceType<SqlJsStatic["Database"]>; notes: number } | null = null;

  for (const name of names) {
    const entry = zip.file(name);
    if (!entry) continue;
    let bytes = await entry.async("uint8array");
    try {
      if (name.endsWith("anki21b") || isZstd(bytes)) {
        bytes = decompressZstd(bytes);
      }
      const db = new SQL.Database(bytes);
      const result = db.exec("SELECT flds FROM notes");
      const rows = result[0]?.values ?? [];
      const real = rows.filter((row) => !UPGRADE_STUB.test(String(row[0] ?? "")));
      if (real.length === 0) {
        db.close();
        continue;
      }
      if (!best || real.length > best.notes) {
        best?.db.close();
        best = { db, notes: real.length };
      } else {
        db.close();
      }
    } catch (err) {
      console.error("skipping collection", name, err);
    }
  }

  if (!best) {
    throw new Error(
      "Could not read notes from this .apkg. Export the deck again from Anki (File → Export → Anki Deck Package) and include scheduling if you can.",
    );
  }
  return best;
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
