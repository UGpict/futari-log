import { json } from "@/server/api/http";
import { getEnv } from "@/config/env";

export async function GET() {
  const env = getEnv();
  return json({
    ok: true,
    runtime: env.runtime,
    authBackend: env.authBackend,
    dataBackend: env.dataBackend,
    emulator: env.emulator,
    gemini: env.geminiConfigured,
    geminiVia: env.geminiVia,
    geminiModel: env.geminiModel,
  });
}
