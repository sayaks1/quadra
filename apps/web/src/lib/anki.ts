import JSZip from "jszip";
import { decompress as decompressZstd } from "fzstd";
import type { AnkiState, ProposedCard } from "@quadra/shared";

export interface AnkiImportResult {
  cards: ProposedCard[];
  media: Record<string, Uint8Array>;
  mediaMap: Record<string, string>;
}

type SqlDb = {
  exec: (sql: string) => Array<{ columns: string[]; values: unknown[][] }>;
  close: () => void;
};

type SqlJsStatic = {
  Database: new (data?: ArrayLike<number>) => SqlDb;
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

const CJK_RE = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/;
const LATIN_RE = /[A-Za-z]/;

function scriptScore(text: string) {
  const cjk = (text.match(new RegExp(CJK_RE.source, "g")) || []).length;
  const latin = (text.match(new RegExp(LATIN_RE.source, "g")) || []).length;
  return { cjk, latin };
}

/** True when the text is primarily English / Latin (flashcard front). */
function looksEnglish(text: string) {
  const { cjk, latin } = scriptScore(text);
  return latin > 0 && latin >= Math.max(1, cjk) * 2;
}

/** True when the text contains CJK / kana (target-language side). */
function looksTargetLanguage(text: string) {
  return CJK_RE.test(text);
}

/**
 * Split a target-language Anki field into word + optional reading + example notes.
 * Supports "鱼 (yú)", "xián (咸)", and multi-line example blocks.
 */
function splitTargetField(text: string): { term: string; reading: string; notes: string } {
  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const head = lines[0] || text.trim();
  let term = head;
  let reading = "";

  const paren = head.match(/^(.+?)\s*[（(]([^）)]+)[）)]\s*$/);
  if (paren) {
    const outer = paren[1]!.trim();
    const inner = paren[2]!.trim();
    if (looksTargetLanguage(outer) && !looksTargetLanguage(inner)) {
      term = outer;
      reading = inner;
    } else if (!looksTargetLanguage(outer) && looksTargetLanguage(inner)) {
      term = inner;
      reading = outer;
    }
  }

  return { term, reading, notes: lines.slice(1).join("\n") };
}

/**
 * Quadra stores English in `meaning` (study front) and the target word in `term` (back).
 * Anki notes vary — English-first or word-first — so detect and normalize.
 */
function mapAnkiFields(fields: string[]): {
  term: string;
  reading: string;
  meaning: string;
  notes: string;
} {
  const a = fields[0] || "";
  const b = fields[1] || "";
  const c = fields[2] || "";
  const rest = fields.slice(3).filter(Boolean).join("\n");

  // English front / target back (common for this Chinese deck)
  if (a && b && looksEnglish(a) && looksTargetLanguage(b)) {
    const target = splitTargetField(b);
    return {
      meaning: a,
      term: target.term,
      reading: target.reading || c,
      notes: [target.notes, rest].filter(Boolean).join("\n"),
    };
  }

  // Target front / English back (classic vocab note)
  if (a && b && looksTargetLanguage(a) && looksEnglish(b)) {
    const target = splitTargetField(a);
    return {
      term: target.term,
      reading: target.reading || c,
      meaning: b,
      notes: [target.notes, rest].filter(Boolean).join("\n"),
    };
  }

  // Fallback: assume field0 = word, field1 = English
  if (b) {
    return {
      term: a,
      reading: c,
      meaning: b,
      notes: rest,
    };
  }

  return {
    term: a,
    reading: c,
    meaning: fields.slice(1).join(" — "),
    notes: rest,
  };
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
    const crt = readCollectionCrt(db);
    const grouped = readNotesWithScheduling(db);
    for (const row of grouped) {
      const rawFlds = row.flds;
      const rawFields = rawFlds.split("\x1f");
      const fields = rawFields.map(stripHtml);

      const mapped = mapAnkiFields(fields);
      if (!mapped.term && !mapped.meaning) continue;
      if (
        UPGRADE_STUB.test(mapped.term) ||
        UPGRADE_STUB.test(mapped.meaning) ||
        UPGRADE_STUB.test(rawFlds)
      ) {
        continue;
      }

      let imageKey: string | null = null;
      let audioKey: string | null = null;
      for (const raw of rawFields) {
        if (!imageKey) {
          const ref = extractImageRef(raw);
          if (ref) {
            const mediaKey = nameToKey[ref] ?? nameToKey[pathBasename(ref)];
            const filename = mediaKey != null ? mediaMap[mediaKey] || ref : ref;
            if (/\.(png|jpe?g|gif|webp|svg)$/i.test(filename) || mediaKey != null) {
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
        term: mapped.term,
        reading: mapped.reading,
        meaning: mapped.meaning,
        notes: mapped.notes,
        imageKey,
        audioKey,
        anki: row.scheduling ? schedulingFromAnki(row.scheduling, crt) : undefined,
      });
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

type SchedRow = {
  type: number;
  queue: number;
  due: number;
  ivl: number;
  factor: number;
  reps: number;
  lapses: number;
  left: number;
};

function num(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function readCollectionCrt(db: SqlDb) {
  try {
    const res = db.exec("SELECT crt FROM col LIMIT 1");
    const crt = num(res[0]?.values[0]?.[0]);
    if (crt > 1_000_000_000) return crt;
  } catch {
    /* collection metadata missing */
  }
  const nowSec = Math.floor(Date.now() / 1000);
  return nowSec - (nowSec % 86400);
}

function progressScore(s: SchedRow) {
  if (s.queue < 0) return -1;
  if (s.type === 2 || s.queue === 2) return 1_000_000 + s.reps + Math.max(0, s.ivl);
  if (s.type === 1 || s.type === 3) return 10_000 + s.reps;
  return s.reps;
}

/** One row per note, keeping the sibling card with the most progress. */
function readNotesWithScheduling(db: SqlDb): Array<{ flds: string; scheduling: SchedRow | null }> {
  try {
    const res = db.exec(`
      SELECT n.id AS nid, n.flds AS flds, c.type AS type, c.queue AS queue,
             c.due AS due, c.ivl AS ivl, c.factor AS factor, c.reps AS reps,
             c.lapses AS lapses, c."left" AS steps_left
      FROM notes n
      LEFT JOIN cards c ON c.nid = n.id
    `);
    const table = res[0];
    if (!table) return [];
    const col = (name: string) => table.columns.indexOf(name);
    const byNote = new Map<string, { flds: string; scheduling: SchedRow | null; score: number }>();
    for (const row of table.values) {
      const id = String(row[col("nid")] ?? "");
      const flds = String(row[col("flds")] ?? "");
      const hasCard = row[col("type")] != null && row[col("type")] !== "";
      const scheduling: SchedRow | null = hasCard
        ? {
            type: num(row[col("type")]),
            queue: num(row[col("queue")]),
            due: num(row[col("due")]),
            ivl: num(row[col("ivl")]),
            factor: num(row[col("factor")]),
            reps: num(row[col("reps")]),
            lapses: num(row[col("lapses")]),
            left: num(row[col("steps_left")]),
          }
        : null;
      const score = scheduling ? progressScore(scheduling) : -2;
      const prev = byNote.get(id);
      if (!prev || score > prev.score) byNote.set(id, { flds, scheduling, score });
    }
    return [...byNote.values()].map(({ flds, scheduling }) => ({ flds, scheduling }));
  } catch (err) {
    console.error("anki scheduling query failed; importing notes without progress", err);
    const res = db.exec("SELECT flds FROM notes");
    return (res[0]?.values ?? []).map((row) => ({
      flds: String(row[0] ?? ""),
      scheduling: null,
    }));
  }
}

/** Map Anki's cards table onto Quadra's scheduler. */
function schedulingFromAnki(s: SchedRow, crtSec: number): AnkiState {
  const ease = s.factor >= 1300 ? Math.round((s.factor / 1000) * 100) / 100 : 2.5;
  const intervalDays = s.ivl > 0 ? s.ivl : 0;
  let phase: AnkiState["phase"] = "new";
  if (s.type === 2 || s.queue === 2) phase = "review";
  else if (s.type === 3) phase = "relearning";
  else if (s.type === 1 || s.queue === 1 || s.queue === 3) phase = "learning";

  const remaining = Math.abs(s.left) % 1000;
  const learningStep = phase === "learning" || phase === "relearning" ? (remaining <= 1 ? 1 : 0) : 0;

  let dueMs: number;
  if (s.queue < 0) {
    dueMs = Date.UTC(2099, 0, 1);
  } else if ((s.queue === 1 || phase === "learning") && s.due > 1_000_000_000) {
    dueMs = s.due * 1000;
  } else if (phase === "review" || phase === "relearning" || s.queue === 2 || s.queue === 3) {
    dueMs = (crtSec + s.due * 86400) * 1000;
  } else {
    dueMs = Date.now();
  }
  if (!Number.isFinite(dueMs)) dueMs = Date.now();

  return {
    phase,
    due: new Date(dueMs).toISOString(),
    intervalDays: phase === "review" ? Math.max(intervalDays, 1) : intervalDays,
    ease,
    reps: Math.max(0, s.reps),
    lapses: Math.max(0, s.lapses),
    learningStep,
    lastReview: null,
  };
}

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
