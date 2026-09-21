import type {
  Card,
  Deck,
  QuadraSettings,
  QuadraStore,
  ReviewLog,
} from "@quadra/shared";
import { DEFAULT_ANKI_CONFIG } from "@quadra/shared";
import { getSupabaseAdmin } from "@/lib/supabase";

type DeckRow = {
  id: string;
  name: string;
  language: Deck["language"];
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type CardRow = {
  id: string;
  deck_id: string;
  term: string;
  reading: string;
  meaning: string;
  notes: string;
  image_key: string | null;
  audio_key: string | null;
  audio_source: Card["audioSource"];
  anki: Card["anki"];
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type ReviewRow = {
  id: string;
  card_id: string;
  rating: ReviewLog["rating"];
  reviewed_at: string;
  scheduled_days: number;
};

function defaultSettings(): QuadraSettings {
  return {
    anki: {
      ...DEFAULT_ANKI_CONFIG,
      learningSteps: [...DEFAULT_ANKI_CONFIG.learningSteps],
      relearningSteps: [...DEFAULT_ANKI_CONFIG.relearningSteps],
    },
  };
}

export async function pullCloudStore(): Promise<QuadraStore | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const [decksRes, cardsRes, reviewsRes, settingsRes] = await Promise.all([
    supabase.from("decks").select("*"),
    supabase.from("cards").select("*"),
    supabase.from("reviews").select("*"),
    supabase.from("settings").select("*").eq("id", "default").maybeSingle(),
  ]);

  if (decksRes.error) throw new Error(decksRes.error.message);
  if (cardsRes.error) throw new Error(cardsRes.error.message);
  if (reviewsRes.error) throw new Error(reviewsRes.error.message);
  if (settingsRes.error) throw new Error(settingsRes.error.message);

  const decks = ((decksRes.data ?? []) as DeckRow[]).map(
    (d): Deck => ({
      id: d.id,
      name: d.name,
      language: d.language,
      createdAt: d.created_at,
      updatedAt: d.updated_at,
      deletedAt: d.deleted_at,
    }),
  );

  const cards = ((cardsRes.data ?? []) as CardRow[]).map(
    (c): Card => ({
      id: c.id,
      deckId: c.deck_id,
      term: c.term,
      reading: c.reading ?? "",
      meaning: c.meaning ?? "",
      notes: c.notes ?? "",
      imageKey: c.image_key,
      audioKey: c.audio_key,
      audioSource: c.audio_source ?? "none",
      anki: c.anki,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
      deletedAt: c.deleted_at,
    }),
  );

  const reviews = ((reviewsRes.data ?? []) as ReviewRow[]).map(
    (r): ReviewLog => ({
      id: r.id,
      cardId: r.card_id,
      rating: r.rating,
      reviewedAt: r.reviewed_at,
      scheduledDays: r.scheduled_days,
    }),
  );

  const settingsPayload = settingsRes.data?.payload as QuadraSettings | undefined;
  const version = (settingsRes.data?.version as number | undefined) ?? 3;

  return {
    decks,
    cards,
    reviews,
    settings: settingsPayload?.anki ? settingsPayload : defaultSettings(),
    version,
  };
}

export async function pushCloudStore(store: QuadraStore): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is not configured");

  const deckRows = store.decks.map((d) => ({
    id: d.id,
    name: d.name,
    language: d.language,
    created_at: d.createdAt,
    updated_at: d.updatedAt,
    deleted_at: d.deletedAt ?? null,
  }));

  const cardRows = store.cards.map((c) => ({
    id: c.id,
    deck_id: c.deckId,
    term: c.term,
    reading: c.reading,
    meaning: c.meaning,
    notes: c.notes,
    image_key: c.imageKey ?? null,
    audio_key: c.audioKey ?? null,
    audio_source: c.audioSource,
    anki: c.anki,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
    deleted_at: c.deletedAt ?? null,
  }));

  const reviewRows = store.reviews.map((r) => ({
    id: r.id,
    card_id: r.cardId,
    rating: r.rating,
    reviewed_at: r.reviewedAt,
    scheduled_days: r.scheduledDays,
  }));

  // Replace snapshot: clear then upsert (single-tenant service-role sync)
  const { error: delReviews } = await supabase
    .from("reviews")
    .delete()
    .neq("id", "");
  if (delReviews) throw new Error(delReviews.message);

  const { error: delCards } = await supabase.from("cards").delete().neq("id", "");
  if (delCards) throw new Error(delCards.message);

  const { error: delDecks } = await supabase.from("decks").delete().neq("id", "");
  if (delDecks) throw new Error(delDecks.message);

  if (deckRows.length) {
    const { error } = await supabase.from("decks").upsert(deckRows);
    if (error) throw new Error(error.message);
  }
  if (cardRows.length) {
    await upsertInChunks(supabase, "cards", cardRows);
  }
  if (reviewRows.length) {
    const { error } = await supabase.from("reviews").upsert(reviewRows);
    if (error) throw new Error(error.message);
  }

  const { error: settingsError } = await supabase.from("settings").upsert({
    id: "default",
    payload: store.settings,
    version: store.version,
    updated_at: new Date().toISOString(),
  });
  if (settingsError) throw new Error(settingsError.message);
}

/** Insert/update without wiping existing rows. Chunked so large decks don't exceed request limits. */
export async function upsertCloudPieces(input: {
  decks?: Deck[];
  cards?: Card[];
  settings?: QuadraSettings;
  version?: number;
}): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is not configured");

  if (input.decks?.length) {
    const deckRows = input.decks.map((d) => ({
      id: d.id,
      name: d.name,
      language: d.language,
      created_at: d.createdAt,
      updated_at: d.updatedAt,
      deleted_at: d.deletedAt ?? null,
    }));
    const { error } = await supabase.from("decks").upsert(deckRows);
    if (error) throw new Error(error.message);
  }

  if (input.cards?.length) {
    const cardRows = input.cards.map((c) => ({
      id: c.id,
      deck_id: c.deckId,
      term: c.term,
      reading: c.reading,
      meaning: c.meaning,
      notes: c.notes,
      image_key: c.imageKey ?? null,
      audio_key: c.audioKey ?? null,
      audio_source: c.audioSource,
      anki: c.anki,
      created_at: c.createdAt,
      updated_at: c.updatedAt,
      deleted_at: c.deletedAt ?? null,
    }));
    await upsertInChunks(supabase, "cards", cardRows);
  }

  if (input.settings) {
    const { error } = await supabase.from("settings").upsert({
      id: "default",
      payload: input.settings,
      version: input.version ?? 3,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
  }
}

async function upsertInChunks(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  table: "cards",
  rows: Record<string, unknown>[],
  size = 100,
) {
  for (let i = 0; i < rows.length; i += size) {
    const slice = rows.slice(i, i + size);
    const { error } = await supabase.from(table).upsert(slice);
    if (error) throw new Error(error.message);
  }
}
