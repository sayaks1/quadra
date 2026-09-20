import { createInitialFsrs } from "./fsrs";
import type { Card, Deck, QuadraStore } from "./types";

function id(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createSeedStore(now = new Date()): QuadraStore {
  const ts = now.toISOString();
  const decks: Deck[] = [
    {
      id: "deck_ja",
      name: "Japanese vocabulary",
      language: "ja",
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: "deck_ko",
      name: "Korean vocabulary",
      language: "ko",
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: "deck_zh",
      name: "Chinese vocabulary",
      language: "zh",
      createdAt: ts,
      updatedAt: ts,
    },
  ];

  const samples: Array<Omit<Card, "fsrs" | "createdAt" | "updatedAt" | "id" | "audioSource"> & { id: string }> = [
    {
      id: "card_hanabi",
      deckId: "deck_ja",
      term: "花火",
      reading: "はなび",
      meaning: "fireworks. Literally fire flowers.",
      notes: "",
      imageKey: null,
      audioKey: null,
    },
    {
      id: "card_benkyo",
      deckId: "deck_ja",
      term: "勉強",
      reading: "べんきょう",
      meaning: "study; diligence",
      notes: "",
      imageKey: null,
      audioKey: null,
    },
    {
      id: "card_arigatou",
      deckId: "deck_ja",
      term: "ありがとう",
      reading: "arigatou",
      meaning: "thank you",
      notes: "",
      imageKey: null,
      audioKey: null,
    },
    {
      id: "card_annyeong",
      deckId: "deck_ko",
      term: "안녕하세요",
      reading: "annyeonghaseyo",
      meaning: "hello (polite)",
      notes: "",
      imageKey: null,
      audioKey: null,
    },
    {
      id: "card_sarang",
      deckId: "deck_ko",
      term: "사랑",
      reading: "sarang",
      meaning: "love",
      notes: "",
      imageKey: null,
      audioKey: null,
    },
    {
      id: "card_mul",
      deckId: "deck_ko",
      term: "물",
      reading: "mul",
      meaning: "water",
      notes: "",
      imageKey: null,
      audioKey: null,
    },
    {
      id: "card_nihao",
      deckId: "deck_zh",
      term: "你好",
      reading: "nǐ hǎo",
      meaning: "hello",
      notes: "",
      imageKey: null,
      audioKey: null,
    },
    {
      id: "card_xiexie",
      deckId: "deck_zh",
      term: "谢谢",
      reading: "xièxie",
      meaning: "thank you",
      notes: "",
      imageKey: null,
      audioKey: null,
    },
    {
      id: "card_xuexi",
      deckId: "deck_zh",
      term: "学习",
      reading: "xuéxí",
      meaning: "to study; learning",
      notes: "",
      imageKey: null,
      audioKey: null,
    },
  ];

  const cards: Card[] = samples.map((s, index) => {
    const created = new Date(now.getTime() - index * 3600_000).toISOString();
    const fsrs = createInitialFsrs(now);
    // Mix some learning state for demo realism
    if (index % 3 === 1) {
      fsrs.state = "learning";
      fsrs.reps = 2;
      fsrs.due = new Date(now.getTime() - 60_000).toISOString();
    } else if (index % 3 === 2) {
      fsrs.state = "review";
      fsrs.reps = 6;
      fsrs.stability = 11;
      fsrs.scheduled_days = 11;
      fsrs.due = new Date(now.getTime() - 120_000).toISOString();
      fsrs.last_review = new Date(now.getTime() - 11 * 86400_000).toISOString();
    }
    return {
      ...s,
      audioSource: "none",
      fsrs,
      createdAt: created,
      updatedAt: created,
    };
  });

  return { decks, cards, reviews: [], version: 1 };
}

export function newId(prefix: string) {
  return id(prefix);
}
