import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";
import {
  classifyLlmJsonAgainstSchema,
  extractJsonObject,
  LLM_FAILURE_CONTENT_CHARS,
  llmParseFailureEventPayload,
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

describe("extractJsonObject", () => {
  it("pulls fenced and embedded JSON without relaxing schema", () => {
    const fenced = extractJsonObject('Sure.\n```json\n{"action":"DONE"}\n```\n');
    assert.deepEqual(fenced, { action: "DONE" });
    const embedded = extractJsonObject('prefix {"action":"ASK_ONE"} suffix');
    assert.deepEqual(embedded, { action: "ASK_ONE" });
    assert.equal(extractJsonObject("no json here"), null);
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

describe("llmParseFailureEventPayload", () => {
  it("omits content preview so Firestore events do not store private reflection text", () => {
    const payload = llmParseFailureEventPayload({
      task: "reflect",
      attempt: 1,
      repaired: false,
      kind: "schema_validation_failed",
      zodFlatten: { formErrors: [], fieldErrors: { action: ["Invalid"] } },
      requestedModel: "openai/gpt-4o-mini",
      actualModel: "gpt-4o-mini-2024-07-18",
    });
    assert.equal(payload.failureKind, "schema_validation_failed");
    assert.equal(payload.task, "reflect");
    assert.equal(payload.attempt, 1);
    assert.equal(payload.actualModel, "gpt-4o-mini-2024-07-18");
    assert.ok(payload.zodFlatten);
    assert.equal("contentPreview" in payload, false);
    assert.equal("contentTruncated" in payload, false);
    assert.deepEqual(Object.keys(payload).sort(), [
      "actualModel",
      "agent",
      "attempt",
      "failureKind",
      "repaired",
      "requestedModel",
      "task",
      "zodFlatten",
    ]);
  });
});
