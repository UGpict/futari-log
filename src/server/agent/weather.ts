import { getWeather, type ProviderCtx } from "@/server/providers";
import { dailyFresh, remember } from "./memory";
import type { AgentLog, AgentMemories } from "./types";

type WeatherDaily = {
  fetchedAt: string;
  dateKey: string;
  lat: number;
  lng: number;
  precipitationMm: number | null;
  evidenceId: string;
};

function weatherKey(lat: number, lng: number, at: string): string {
  return `${lat.toFixed(3)}:${lng.toFixed(3)}:${at.slice(0, 10)}`;
}

export async function runWeather(input: {
  ctx: ProviderCtx;
  log: AgentLog;
  memories: AgentMemories;
  lat: number;
  lng: number;
  at: string;
}): Promise<{ precipitationMm: number | null; injected: boolean; evidenceId: string }> {
  const overlay = input.ctx.overlays.find((o) => o.kind === "WEATHER");
  const dateKey = weatherKey(input.lat, input.lng, input.at);
  const cached = input.memories.weather?.facts.daily as WeatherDaily | undefined;
  if (!overlay && cached && cached.dateKey === dateKey && dailyFresh(cached.fetchedAt)) {
    await input.log("weather", "CACHE_HIT", "本日取得済みの天気を使う");
    await input.log("weather", "TOOL_COMPLETED", "天気（キャッシュ）", {
      evidenceIds: cached.evidenceId ? [cached.evidenceId] : [],
    });
    return {
      precipitationMm: cached.precipitationMm,
      injected: false,
      evidenceId: cached.evidenceId,
    };
  }

  await input.log("weather", "TOOL_STARTED", "天気を見る");
  const weather = await getWeather(input.ctx, {
    lat: input.lat,
    lng: input.lng,
    at: input.at,
  });
  if (!weather.injected) {
    remember(input.memories, "weather", {
      note: `降水${weather.precipitationMm ?? "?"}mm`,
      factKey: "daily",
      factValue: {
        fetchedAt: new Date().toISOString(),
        dateKey,
        lat: input.lat,
        lng: input.lng,
        precipitationMm: weather.precipitationMm,
        evidenceId: weather.evidence.id,
      } satisfies WeatherDaily,
    });
  } else {
    remember(input.memories, "weather", {
      note: `注入 降水${weather.precipitationMm ?? "?"}mm`,
    });
  }
  await input.log("weather", "TOOL_COMPLETED", weather.injected ? "天気（注入）" : "天気", {
    evidenceIds: [weather.evidence.id],
  });
  return {
    precipitationMm: weather.precipitationMm,
    injected: weather.injected,
    evidenceId: weather.evidence.id,
  };
}
