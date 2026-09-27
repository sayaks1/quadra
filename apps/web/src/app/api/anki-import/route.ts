import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import initSqlJs from "sql.js";
import JSZip from "jszip";
import {
  createInitialAnki,
  newId,
  type Card,
  type Deck,
  type Language,
  type QuadraStore,
} from "@quadra/shared";
import { parseApkgWithSql } from "@/lib/anki";
import { pullCloudStore, upsertCloudPieces } from "@/lib/cloud-store";
import { writeLocalStore, readLocalStore } from "@/lib/local-store";
import { saveMedia } from "@/lib/media";
import { getSupabaseAdmin, isCloudConfigured, MEDIA_BUCKET } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

function matchKey(term: string, meaning: string) {
  return `${term.trim().toLowerCase()}\0${meaning.trim().toLowerCase()}`;
}

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

async function loadStore(): Promise<QuadraStore> {
  if (isCloudConfigured()) {
    const cloud = await pullCloudStore();
    if (cloud) return cloud;
  }
  const local = await readLocalStore();
  if (local?.decks && local.cards) return local;
  throw new Error("Could not read the current deck store");
}

async function loadApkgBuffer(req: Request): Promise<{
  buf: Buffer;
  deckId: string;
  deckName: string;
  filename: string;
  language?: Language;
  storageKey?: string;
}> {
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const body = (await req.json()) as {
      storageKey?: string;
      deckId?: string;
      deckName?: string;
      filename?: string;
      language?: Language;
    };
    const storageKey = String(body.storageKey || "").trim();
    if (!storageKey) {
      throw new Error("Missing storageKey — upload the .apkg to storage first");
    }
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      throw new Error("Cloud storage is not configured");
    }
    const { data, error } = await supabase.storage.from(MEDIA_BUCKET).download(storageKey);
    if (error || !data) {
      throw new Error(error?.message || "Could not download the uploaded .apkg");
    }
    const ab = await data.arrayBuffer();
    const filename =
      String(body.filename || path.basename(storageKey)).replace(/\.apkg$/i, "") + ".apkg";
    return {
      buf: Buffer.from(ab),
      deckId: String(body.deckId || "").trim(),
      deckName:
        String(body.deckName || filename)
          .replace(/\.apkg$/i, "")
          .trim() || "Anki import",
      filename,
      language: body.language,
      storageKey,
    };
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    throw new Error("Missing .apkg file");
  }
  return {
    buf: Buffer.from(await file.arrayBuffer()),
    deckId: String(form.get("deckId") || "").trim(),
    deckName:
      String(form.get("deckName") || file.name || "Anki import")
        .replace(/\.apkg$/i, "")
        .trim() || "Anki import",
    filename: file.name,
    language: (String(form.get("language") || "").trim() as Language) || undefined,
  };
}

export async function POST(req: Request) {
  let storageKey: string | undefined;
  try {
    const loaded = await loadApkgBuffer(req);
    storageKey = loaded.storageKey;
    const { buf, deckId, deckName, filename, language } = loaded;

    const wasmPath = path.join(process.cwd(), "public", "sql-wasm.wasm");
    const wasmFile = await readFile(wasmPath);
    const wasmBinary = wasmFile.buffer.slice(
      wasmFile.byteOffset,
      wasmFile.byteOffset + wasmFile.byteLength,
    );
    const SQL = await initSqlJs({ wasmBinary });
    const ab = buf.buffer.slice(
      buf.byteOffset,
      buf.byteOffset + buf.byteLength,
    ) as ArrayBuffer;

    // Notes only — media uploaded after cards are saved
    const result = await parseApkgWithSql(ab, SQL, { loadMedia: false });

    const store = await loadStore();
    const now = new Date().toISOString();
    const targetDeckId = deckId || newId("deck");
    let deck: Deck | undefined = store.decks.find((d) => d.id === targetDeckId);
    if (!deck) {
      deck = {
        id: targetDeckId,
        name: deckName,
        language: language && ["ko", "ja", "zh", "en", "other"].includes(language) ? language : "other",
        createdAt: now,
        updatedAt: now,
      };
      store.decks.push(deck);
    } else {
      deck.updatedAt = now;
      if (language && ["ko", "ja", "zh", "en", "other"].includes(language)) {
        deck.language = language;
      }
    }

    const config = store.settings?.anki;
    const deckCards = store.cards.filter((c) => c.deckId === deck!.id && !c.deletedAt);
    const byKey = new Map(deckCards.map((c) => [matchKey(c.term, c.meaning), c]));

    const imported: Card[] = [];
    const updated: Card[] = [];
    for (const item of result.cards) {
      const anki = item.anki ?? createInitialAnki(new Date(), config);
      const key = matchKey(item.term, item.meaning);
      const existing = byKey.get(key);
      if (existing) {
        existing.anki = anki;
        existing.reading = item.reading || existing.reading;
        existing.notes = item.notes || existing.notes;
        existing.audioSource = item.audioKey ? "anki" : existing.audioSource;
        existing.updatedAt = now;
        updated.push(existing);
        continue;
      }
      const card: Card = {
        id: newId("card"),
        deckId: deck!.id,
        term: item.term,
        reading: item.reading,
        meaning: item.meaning,
        notes: item.notes,
        imageKey: null,
        audioKey: null,
        audioSource: item.audioKey ? "anki" : "none",
        anki,
        createdAt: now,
        updatedAt: now,
      };
      imported.push(card);
      byKey.set(key, card);
    }

    const mediaPlan = [...imported, ...updated].map((card) => {
      const item = result.cards.find(
        (c) => matchKey(c.term, c.meaning) === matchKey(card.term, card.meaning),
      );
      return {
        id: card.id,
        imageName: item?.imageKey || null,
        audioName: item?.audioKey || null,
      };
    });

    store.cards.push(...imported);
    if (isCloudConfigured()) {
      await upsertCloudPieces({
        decks: [deck],
        cards: [...imported, ...updated],
        settings: store.settings,
        version: store.version,
      });
    }
    await writeLocalStore(store);

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
        if (isCloudConfigured()) {
          await upsertCloudPieces({ cards: touched });
        }
        await writeLocalStore(store);
      }
    }

    // Clean up temporary upload
    if (storageKey) {
      const supabase = getSupabaseAdmin();
      await supabase?.storage.from(MEDIA_BUCKET).remove([storageKey]).catch(() => null);
    }

    const kept = [...imported, ...updated].filter((c) => c.anki.phase !== "new").length;

    return NextResponse.json({
      ok: true,
      count: imported.length + updated.length,
      added: imported.length,
      updated: updated.length,
      withProgress: kept,
      deckId: deck.id,
      mediaUploaded,
      filename,
    });
  } catch (e) {
    console.error("anki import failed", e);
    const message = e instanceof Error ? e.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
