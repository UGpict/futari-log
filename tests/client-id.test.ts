import assert from "node:assert/strict";
import { test } from "node:test";
import { createClientId } from "../src/client/id";

test("HTTP-style crypto without randomUUID produces UUID v4 IDs", () => {
  const source = { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) };
  const ids = Array.from({ length: 1000 }, () => createClientId(source));
  for (const id of ids) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(new Set(ids).size, ids.length);
});

test("secure-context native UUID method retains its receiver", () => {
  const source = {
    getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto),
    randomUUID() {
      assert.equal(this, source);
      return "00000000-0000-4000-8000-000000000001" as const;
    },
  };
  assert.equal(createClientId(source), "00000000-0000-4000-8000-000000000001");
});
