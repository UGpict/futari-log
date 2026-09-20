import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractOgImage,
  groundingToolForModel,
  parseModelJson,
  resolveHttpUrl,
} from "../src/server/providers/geminiGrounding";

describe("gemini grounding helpers", () => {
  it("uses google_search_retrieval only for 1.5 models", () => {
    assert.deepEqual(groundingToolForModel("gemini-1.5-flash"), {
      google_search_retrieval: {
        dynamic_retrieval_config: { mode: "MODE_DYNAMIC", dynamic_threshold: 0.3 },
      },
    });
    assert.deepEqual(groundingToolForModel("gemini-3.5-flash"), { google_search: {} });
  });

  it("parses fenced JSON from the model", () => {
    const parsed = parseModelJson('```json\n{"spots":[{"id":"a","imageUrl":"https://img.example/a.jpg"}]}\n```');
    assert.equal(parsed.spots?.[0]?.id, "a");
    assert.equal(parsed.spots?.[0]?.imageUrl, "https://img.example/a.jpg");
  });

  it("extracts og:image and upgrades http", () => {
    const html = `<meta property="og:image" content="http://cdn.example/spot.jpg">`;
    assert.equal(extractOgImage(html, "https://www.example.com/page"), "https://cdn.example/spot.jpg");
    assert.equal(resolveHttpUrl("/rel.jpg", "https://www.example.com/p"), "https://www.example.com/rel.jpg");
  });
});
