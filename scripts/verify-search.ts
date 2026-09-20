process.env.ENABLE_DEMO_CONTROLS ??= "true";

import { getEnv } from "../src/config/env";
import { groundedGoogleSearch, listOrcaModels, pickGeminiSearchModel } from "../src/server/llm/search";

function redact(value: string): string {
  return value.replace(/sk-[a-zA-Z0-9_-]+/g, "sk-redacted").replace(/AIza[0-9A-Za-z_-]+/g, "key-redacted");
}

async function main() {
  const env = getEnv();
  if (!env.orcaApiKey) {
    console.log(JSON.stringify({ ok: false, error: "ORCAROUTER_API_KEY missing" }));
    process.exit(1);
  }
  const models = await listOrcaModels();
  const gemini = models.map((m) => m.id).filter((id) => id.startsWith("google/"));
  const model = pickGeminiSearchModel(
    models.map((m) => m.id),
    env.orcaSearchModel,
  );
  const date = env.demoDate;
  const area = env.demoAreaName;
  const query = `${area} ${date} 展覧会 開催 公式`;
  const result = await groundedGoogleSearch({ query, model });
  console.log(
    JSON.stringify(
      {
        ok: result.ok,
        grounded: result.grounded,
        requestedModel: result.requestedModel,
        actualModel: result.actualModel,
        geminiModelCount: gemini.length,
        geminiSamples: gemini.slice(0, 12),
        query,
        latencyMs: result.latencyMs,
        usage: result.usage,
        citationCount: result.citations.length,
        citations: result.citations.slice(0, 8).map((c) => ({
          host: safeHost(c.url),
          title: c.title,
        })),
        webSearchQueries: result.webSearchQueries.slice(0, 8),
        textChars: result.text.length,
        textPreview: redact(result.text).slice(0, 400),
        path: result.path,
        rawKeys: result.rawKeys,
        messageKeys: result.messageKeys,
        error: result.error,
      },
      null,
      2,
    ),
  );
  process.exit(result.ok ? 0 : 2);
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "invalid";
  }
}

void main();
