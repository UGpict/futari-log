import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";
import {
  classifyLlmJsonAgainstSchema,
  LLM_FAILURE_CONTENT_CHARS,
  previewMaskedLlmContent,
} from "../src/server/llm/index";

const tiny = z.object({
  action: z.enum(["DONE", "ASK_ONE"]),
});

describe("classifyLlmJsonAgainstSchema", () => {
  it("separates json parse failure from zod failure", () => {
    const badJson = classifyLlmJsonAgainstSchema("{not-json", tiny);
    assert.equal(badJson.kind, "json_parse_failed");
    assert.equal(badJson.zodFlatten, null);

    const badSchema = classifyLlmJsonAgainstSchema(JSON.stringify({ action: "NOPE" }), tiny);
    assert.equal(badSchema.kind, "schema_validation_failed");
    assert.ok(badSchema.zodFlatten);
    const fieldErrors = badSchema.zodFlatten?.fieldErrors as Record<string, string[] | undefined>;
    assert.ok(fieldErrors.action?.length);

    const ok = classifyLlmJsonAgainstSchema(JSON.stringify({ action: "DONE" }), tiny);
    assert.equal(ok.kind, null);
    assert.equal(ok.data?.action, "DONE");
  });
});

describe("previewMaskedLlmContent", () => {
  it("masks email and truncates to LLM_FAILURE_CONTENT_CHARS", () => {
    const email = previewMaskedLlmContent("contact me@example.com please");
    assert.match(email, /\[EMAIL\]/);
    assert.doesNotMatch(email, /me@example\.com/);

    const long = "あ".repeat(LLM_FAILURE_CONTENT_CHARS + 50);
    const preview = previewMaskedLlmContent(long);
    assert.equal(preview.length, LLM_FAILURE_CONTENT_CHARS + 1); // plus ellipsis
    assert.ok(preview.endsWith("…"));
  });
});
