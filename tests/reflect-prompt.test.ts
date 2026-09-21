import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { memoryPlanDirectiveSchema } from "../src/domain/schemas";
import {
  buildReflectSystemPrompt,
  reflectionAnalysisActionSchema,
  reflectionOutputContractFromSchemas,
} from "../src/server/agent/reflectAnalyze";

describe("reflect system prompt contract", () => {
  it("embeds enum values taken from schemas (no hard-coded drift)", () => {
    const contract = reflectionOutputContractFromSchemas();
    const prompt = buildReflectSystemPrompt();

    assert.deepEqual(
      contract.actions,
      [...(reflectionAnalysisActionSchema.shape.action as { options: string[] }).options],
    );
    assert.deepEqual(
      contract.planDirectiveKinds,
      [...(memoryPlanDirectiveSchema.shape.kind as { options: string[] }).options],
    );

    for (const value of [
      ...contract.actions,
      ...contract.subjects,
      ...contract.types,
      ...contract.sourceTypes,
      ...contract.strengths,
      ...contract.scopes,
      ...contract.planDirectiveKinds,
    ]) {
      assert.ok(prompt.includes(value), `missing ${value}`);
    }
    assert.ok(prompt.includes('"action": "CREATE_CANDIDATES"'));
    assert.ok(prompt.includes("PREFER_SEATED_REST"));
    assert.ok(prompt.includes("推測だけで strength=HARD"));
    assert.ok(prompt.includes("未知の kind"));
  });
});
