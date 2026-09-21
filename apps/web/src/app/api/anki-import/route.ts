import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import initSqlJs from "sql.js";
import JSZip from "jszip";
import {
  createInitialAnki,
  newId,
  type Card,
  type Deck,
  type QuadraStore,
} from "@quadra/shared";
import { parseApkgWithSql } from "@/lib/anki";
import { pullCloudStore, upsertCloudPieces } from "@/lib/cloud-store";
import { saveMedia } from "@/lib/media";
import { isCloudConfigured } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 300;

const storePath = () => path.join(process.cwd(), ".data", "store.json");

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

async function readLocal(): Promise<QuadraStore | null> {
  try {
    return JSON.parse(await readFile(storePath(), "utf8")) as QuadraStore;
  } catch {
    return null;
  }
}

async function writeLocal(store: QuadraStore) {
  await mkdir(path.dirname(storePath()), { recursive: true });
  await writeFile(storePath(), JSON.stringify(store), "utf8");
}

async function loadStore(): Promise<QuadraStore> {
  if (isCloudConfigured()) {
    const cloud = await pullCloudStore();
    if (cloud) return cloud;
  }
  const local = await readLocal();
  if (local?.decks && local.cards) return local;
  throw new Error("Could not read the current deck store");
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing .apkg file" }, { status: 400 });
    }

    const deckId = String(form.get("deckId") || "").trim();
    const deckName =
      String(form.get("deckName") || file.name || "Anki import")
        .replace(/\.apkg$/i, "")
        .trim() || "Anki import";

    const buf = Buffer.from(await file.arrayBuffer());
    const wasmPath = path.join(process.cwd(), "public", "sql-wasm.wasm");
    const wasmFile = await readFile(wasmPath);
    const wasmBinary = wasmFile.buffer.slice(
      wasmFile.byteOffset,
      wasmFile.byteOffset + wasmFile.byteLength,
    );
    const SQL = await initSqlJs({ wasmBinary });
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

    // Notes only — don't pull every media file into memory before saving cards
    const result = await parseApkgWithSql(ab, SQL, { loadMedia: false });

    const store = await loadStore();
    const now = new Date().toISOString();
    const targetDeckId = deckId || newId("deck");
    let deck: Deck | undefined = store.decks.find((d) => d.id === targetDeckId);
    if (!deck) {
      deck = {
        id: targetDeckId,
        name: deckName,
        language: "other",
        createdAt: now,
        updatedAt: now,
      };
      store.decks.push(deck);
    } else {
      deck.updatedAt = now;
    }

    const config = store.settings?.anki;
    const imported: Card[] = result.cards.map((item) => ({
      id: newId("card"),
      deckId: deck!.id,
      term: item.term,
      reading: item.reading,
      meaning: item.meaning,
      notes: item.notes,
      imageKey: null,
      audioKey: null,
      audioSource: item.audioKey ? "anki" : "none",
      anki: createInitialAnki(new Date(), config),
      createdAt: now,
      updatedAt: now,
    }));

    // Remember media filenames alongside new ids
    const mediaPlan = imported.map((card, i) => ({
      id: card.id,
      imageName: result.cards[i]?.imageKey || null,
      audioName: result.cards[i]?.audioKey || null,
    }));

    store.cards.push(...imported);
    await writeLocal(store);
    if (isCloudConfigured()) {
      await upsertCloudPieces({
        decks: [deck],
        cards: imported,
        settings: store.settings,
        version: store.version,
      });
    }

    // Attach media after cards exist, so a slow upload can't lose the notes
    let mediaUploaded = 0;
    if (Object.keys(result.mediaMap).length) {
      const zip = await JSZip.loadAsync(ab);
      const savedNames = new Map<string, string>();
      const entries = Object.entries(result.mediaMap);
      const concurrency = 6;
      let cursor = 0;

      async function worker() {
        while (cursor < entries.length) {
          const index = cursor++;
          const [key, rawName] = entries[index]!;
          const name = path.basename(String(rawName || key));
          const zipped = zip.file(key);
          if (!zipped) continue;
          try {
            const bytes = await zipped.async("uint8array");
            const saved = await saveMedia(name, Buffer.from(bytes), contentTypeFor(name));
            savedNames.set(name, saved.key);
            savedNames.set(path.basename(name), saved.key);
            mediaUploaded += 1;
          } catch (err) {
            console.error("media upload failed", name, err);
          }
        }
      }

      await Promise.all(Array.from({ length: concurrency }, () => worker()));

      const touched: Card[] = [];
      for (const plan of mediaPlan) {
        const card = store.cards.find((c) => c.id === plan.id);
        if (!card) continue;
        const imageKey = plan.imageName
          ? savedNames.get(plan.imageName) || savedNames.get(path.basename(plan.imageName))
          : null;
        const audioKey = plan.audioName
          ? savedNames.get(plan.audioName) || savedNames.get(path.basename(plan.audioName))
          : null;
        if (!imageKey && !audioKey) continue;
        card.imageKey = imageKey ?? card.imageKey;
        card.audioKey = audioKey ?? card.audioKey;
        card.updatedAt = new Date().toISOString();
        touched.push(card);
      }

      if (touched.length) {
        await writeLocal(store);
        if (isCloudConfigured()) {
          await upsertCloudPieces({ cards: touched });
        }
      }
    }

    return NextResponse.json({
      ok: true,
      count: imported.length,
      deckId: deck.id,
      mediaUploaded,
      filename: file.name,
    });
  } catch (e) {
    console.error("anki import failed", e);
    const message = e instanceof Error ? e.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
