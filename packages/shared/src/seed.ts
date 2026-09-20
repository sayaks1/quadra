import { createInitialAnki } from "./anki";
import type { Card, Deck, QuadraStore } from "./types";
import { DEFAULT_ANKI_CONFIG } from "./types";

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

  const samples: Array<
    Omit<Card, "anki" | "createdAt" | "updatedAt" | "id" | "audioSource"> & { id: string }
  > = [
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
    const anki = createInitialAnki(now);
    if (index % 3 === 1) {
      anki.phase = "learning";
      anki.learningStep = 0;
      anki.reps = 1;
      anki.due = new Date(now.getTime() - 60_000).toISOString();
    } else if (index % 3 === 2) {
      anki.phase = "review";
      anki.reps = 6;
      anki.intervalDays = 11;
      anki.ease = 2.5;
      anki.due = new Date(now.getTime() - 120_000).toISOString();
      anki.lastReview = new Date(now.getTime() - 11 * 86400_000).toISOString();
    }
    return {
      ...s,
      audioSource: "none" as const,
      anki,
      createdAt: created,
      updatedAt: created,
    };
  });

  return {
    decks,
    cards,
    reviews: [],
    settings: { anki: { ...DEFAULT_ANKI_CONFIG, learningSteps: [...DEFAULT_ANKI_CONFIG.learningSteps], relearningSteps: [...DEFAULT_ANKI_CONFIG.relearningSteps] } },
    version: 2,
  };
}

export function newId(prefix: string) {
  return id(prefix);
}
