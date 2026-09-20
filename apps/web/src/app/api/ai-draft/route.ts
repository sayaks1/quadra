import { NextResponse } from "next/server";
import type { ProposedCard } from "@quadra/shared";

export const runtime = "nodejs";

function heuristicDraft(text: string): ProposedCard[] {
  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 40);

  const cards: ProposedCard[] = [];
  for (const line of lines) {
    const parts = line.split(/\s*[—–\-:|=]\s*|\t+/);
    if (parts.length >= 2) {
      cards.push({
        term: parts[0].trim(),
        reading: parts.length >= 3 ? parts[1].trim() : "",
        meaning: parts.slice(parts.length >= 3 ? 2 : 1).join(" — ").trim(),
        notes: "",
      });
    } else if (/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(line)) {
      cards.push({
        term: line,
        reading: "",
        meaning: "(add meaning)",
        notes: "Drafted from notes — edit before studying",
      });
    }
  }
  return cards.slice(0, 25);
}

export async function POST(req: Request) {
  const { text, language } = (await req.json()) as {
    text?: string;
    language?: string;
  };
  if (!text?.trim()) {
    return NextResponse.json({ error: "Missing notes text" }, { status: 400 });
  }

  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return NextResponse.json({
      cards: heuristicDraft(text),
      mock: true,
      message: "OPENAI_API_KEY not set — used local heuristic draft.",
    });
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Extract vocabulary flashcards from lesson notes. Return JSON {\"cards\":[{\"term\",\"reading\",\"meaning\",\"notes\"}]}. Language focus: " +
            (language || "ja") +
            ". Max 25 cards. Be precise; skip grammar-only lines.",
        },
        { role: "user", content: text.slice(0, 12000) },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json(
      { cards: heuristicDraft(text), error: err, mock: true },
      { status: 200 },
    );
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? "{}";
  try {
    const parsed = JSON.parse(content) as { cards?: ProposedCard[] };
    return NextResponse.json({ cards: parsed.cards ?? [], mock: false });
  } catch {
    return NextResponse.json({ cards: heuristicDraft(text), mock: true });
  }
}
