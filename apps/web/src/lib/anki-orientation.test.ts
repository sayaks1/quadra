import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapAnkiFields } from "./anki";

describe("mapAnkiFields orientation", () => {
  it("maps English-front / Korean-back Anki notes correctly", () => {
    const mapped = mapAnkiFields([
      "main/key point",
      "핵심 \n\nex. 이 문제의 핵심은 무엇인가요?",
    ]);
    assert.equal(mapped.meaning, "main/key point");
    assert.equal(mapped.term, "핵심");
    assert.match(mapped.notes, /이 문제의 핵심/);
  });

  it("maps Korean-front / English-back Anki notes correctly", () => {
    const mapped = mapAnkiFields(["만개하다", "To fully bloom / To be in full blossom"]);
    assert.equal(mapped.term, "만개하다");
    assert.equal(mapped.meaning, "To fully bloom / To be in full blossom");
  });

  it("still maps Japanese English-front notes", () => {
    const mapped = mapAnkiFields(["castle", "お城（しろ）"]);
    assert.equal(mapped.meaning, "castle");
    // Furigana stays in the term (matches existing Japanese deck style)
    assert.equal(mapped.term, "お城（しろ）");
  });
});
