import { getEnv } from "@/config/env";
import type { Evidence, Spot } from "@/domain/schemas";
import { newId } from "@/lib/ids";
import { realNowIso } from "@/lib/time";
import { hydratePlacePhotos } from "./placePhotos";
import type { ProviderCtx } from "./types";

export type GroundedImage = {
  spotId: string;
  imageUrl: string;
  imageSourceUrl: string;
  provider: "gemini-grounding" | "places";
};

export type SpotImageResult = {
  spots: Record<string, Spot>;
  evidence: Record<string, Evidence>;
  queries: string[];
  searchEntryPointHtml: string | null;
};

const GOOGLE_GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

export function groundingToolForModel(model: string): Record<string, unknown> {
  return /1\.5/.test(model)
    ? {
        google_search_retrieval: {
          dynamic_retrieval_config: { mode: "MODE_DYNAMIC", dynamic_threshold: 0.3 },
        },
      }
    : { googleSearch: {} };
}

export function orcaGeminiOrigin(baseUrl: string): string {
  return baseUrl.replace(/\/$/, "").replace(/\/v1$/, "");
}

export function resolveGeminiModelId(model: string, via: "google" | "orcarouter"): string {
  if (via === "orcarouter") return model.includes("/") ? model : `google/${model}`;
  return model.replace(/^google\//, "");
}

export function parseModelJson(text: string): { spots?: { id?: string; name?: string; imageUrl?: string; pageUrl?: string }[] } {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(trimmed) as { spots?: { id?: string; name?: string; imageUrl?: string; pageUrl?: string }[] };
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1)) as {
          spots?: { id?: string; name?: string; imageUrl?: string; pageUrl?: string }[];
        };
      } catch {
        return {};
      }
    }
    return {};
  }
}

export function extractOgImage(html: string, pageUrl: string): string | null {
  const patterns = [
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i,
  ];
  for (const re of patterns) {
    const match = html.match(re);
    const raw = match?.[1]?.trim();
    if (!raw) continue;
    const resolved = resolveHttpUrl(raw, pageUrl);
    if (resolved) return resolved;
  }
  return null;
}

export function resolveHttpUrl(raw: string, base?: string): string | null {
  try {
    const url = new URL(raw, base);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.protocol === "http:") url.protocol = "https:";
    return url.toString();
  } catch {
    return null;
  }
}

function evidenceOf(partial: Omit<Evidence, "id"> & { id?: string }): Evidence {
  return { id: partial.id ?? newId("ev"), ...partial };
}

export async function attachSpotImages(args: {
  ctx: ProviderCtx;
  spots: Record<string, Spot>;
  areaName: string;
  signal?: AbortSignal;
}): Promise<SpotImageResult> {
  const spots: Record<string, Spot> = { ...args.spots };
  const evidence: Record<string, Evidence> = {};
  let queries: string[] = [];
  let searchEntryPointHtml: string | null = null;

  const env = getEnv();
  if (env.googleMapsApiKey) {
    const places = await hydratePlacePhotos(args.ctx, spots, args.signal);
    Object.assign(spots, places.spots);
    for (const ev of places.evidence) evidence[ev.id] = ev;
  }

  const targets = Object.values(spots).filter((s) => !s.imageUrl).slice(0, 4);
  if (env.geminiVia && targets.length) {
    const grounded = await groundedFromGemini({
      ctx: args.ctx,
      spots: targets,
      areaName: args.areaName,
      via: env.geminiVia,
      orcaBaseUrl: env.orcaBaseUrl,
      orcaApiKey: env.orcaApiKey,
      googleApiKey: env.geminiApiKey,
      model: env.geminiModel,
      signal: args.signal,
    });
    queries = grounded.queries;
    searchEntryPointHtml = grounded.searchEntryPointHtml;
    for (const ev of grounded.evidence) evidence[ev.id] = ev;
    for (const img of grounded.images) {
      const spot = spots[img.spotId];
      if (!spot) continue;
      spots[img.spotId] = {
        ...spot,
        imageUrl: img.imageUrl,
        imageSourceUrl: img.imageSourceUrl,
        imageProvider: img.provider,
      };
    }
  }

  for (const spot of Object.values(spots)) {
    if (spot.imageUrl || !spot.officialUrl) continue;
    args.ctx.httpAttempts += 1;
    await args.ctx.onHttp({ provider: "official-og-image", cacheHit: false, attempt: args.ctx.httpAttempts });
    const og = await fetchOgImage(spot.officialUrl, args.signal);
    if (!og) continue;
    spots[spot.id] = {
      ...spot,
      imageUrl: og,
      imageSourceUrl: spot.officialUrl,
      imageProvider: "official-og",
    };
  }

  return { spots, evidence, queries, searchEntryPointHtml };
}

async function groundedFromGemini(args: {
  ctx: ProviderCtx;
  spots: Spot[];
  areaName: string;
  via: "google" | "orcarouter";
  orcaBaseUrl: string;
  orcaApiKey: string | null;
  googleApiKey: string | null;
  model: string;
  signal?: AbortSignal;
}): Promise<{
  images: GroundedImage[];
  evidence: Evidence[];
  queries: string[];
  searchEntryPointHtml: string | null;
}> {
  const lines = args.spots.map((s) => `- id=${s.id} name=${s.name} url=${s.officialUrl ?? ""}`).join("\n");
  const prompt = [
    `${args.areaName} の実在スポットについて、Google 検索で公式または観光案内のページを探し、そのページに載っている代表写真の URL を返す。`,
    "画像を生成しない。検索で見つかった公開写真だけ。不明なら imageUrl は空文字。",
    'JSON object だけ返す: {"spots":[{"id":"","name":"","imageUrl":"","pageUrl":""}]}',
    lines,
  ].join("\n");

  args.ctx.httpAttempts += 1;
  await args.ctx.onHttp({ provider: "gemini-grounding", cacheHit: false, attempt: args.ctx.httpAttempts });

  const modelId = resolveGeminiModelId(args.model, args.via);
  const tool = groundingToolForModel(modelId);
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    tools: [tool],
    generationConfig: { temperature: 0.1 },
  };

  let res: Response;
  const groundingTimeoutMs = args.via === "orcarouter" ? 20_000 : 35_000;
  const groundingSignal = args.signal
    ? AbortSignal.any([args.signal, AbortSignal.timeout(groundingTimeoutMs)])
    : AbortSignal.timeout(groundingTimeoutMs);
  try {
    res =
      args.via === "orcarouter"
        ? await fetch(
            `${orcaGeminiOrigin(args.orcaBaseUrl)}/v1beta/models/${modelId}:generateContent`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${args.orcaApiKey}`,
                "Content-Type": "application/json",
                "X-OrcaRouter-Include-Cost": "true",
              },
              body: JSON.stringify(body),
              signal: groundingSignal,
            },
          )
        : await fetch(`${GOOGLE_GEMINI_ENDPOINT}/${encodeURIComponent(modelId)}:generateContent`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": args.googleApiKey ?? "",
            },
            body: JSON.stringify(body),
            signal: groundingSignal,
          });
  } catch (error) {
    return {
      images: [],
      queries: [],
      searchEntryPointHtml: null,
      evidence: [
        evidenceOf({
          kind: "API",
          provider: "gemini-grounding",
          sourceRef: modelId,
          sourceField: "generateContent",
          fetchedAt: realNowIso(),
          validFor: null,
          note: `Gemini grounding failed via ${args.via}: ${error instanceof Error ? error.name : "error"}`,
        }),
      ],
    };
  }

  const fetchedAt = realNowIso();
  if (!res.ok) {
    return {
      images: [],
      queries: [],
      searchEntryPointHtml: null,
      evidence: [
        evidenceOf({
          kind: "API",
          provider: "gemini-grounding",
          sourceRef: modelId,
          sourceField: "generateContent",
          fetchedAt,
          validFor: null,
          note: `Gemini grounding HTTP ${res.status} via ${args.via} model=${modelId}`,
        }),
      ],
    };
  }

  const json = (await res.json()) as {
    candidates?: {
      content?: { parts?: { text?: string }[] };
      groundingMetadata?: {
        webSearchQueries?: string[];
        searchEntryPoint?: { renderedContent?: string };
        groundingChunks?: { web?: { uri?: string; title?: string } }[];
      };
    }[];
  };
  const candidate = json.candidates?.[0];
  const text = candidate?.content?.parts?.map((p) => p.text ?? "").join("\n") ?? "";
  const parsed = parseModelJson(text);
  const queries = candidate?.groundingMetadata?.webSearchQueries ?? [];
  const searchEntryPointHtml = candidate?.groundingMetadata?.searchEntryPoint?.renderedContent ?? null;
  const chunkUrls = (candidate?.groundingMetadata?.groundingChunks ?? [])
    .map((c) => resolveHttpUrl(c.web?.uri ?? ""))
    .filter((u): u is string => Boolean(u));

  const images: GroundedImage[] = [];
  let pageFetches = 0;
  for (const spot of args.spots) {
    const row = parsed.spots?.find((s) => s.id === spot.id) ?? parsed.spots?.find((s) => s.name === spot.name);
    const modelImage = row?.imageUrl ? resolveHttpUrl(row.imageUrl) : null;
    const pageCandidates = [
      row?.pageUrl ? resolveHttpUrl(row.pageUrl) : null,
      spot.officialUrl ? resolveHttpUrl(spot.officialUrl) : null,
      ...chunkUrls,
    ].filter((u): u is string => Boolean(u));

    let imageUrl = modelImage;
    let source = pageCandidates[0] ?? null;
    if (!imageUrl || !looksLikeImagePath(imageUrl)) {
      imageUrl = null;
      for (const page of pageCandidates.slice(0, 2)) {
        if (pageFetches >= 8) break;
        pageFetches += 1;
        args.ctx.httpAttempts += 1;
        await args.ctx.onHttp({ provider: "gemini-og-image", cacheHit: false, attempt: args.ctx.httpAttempts });
        const og = await fetchOgImage(page, args.signal);
        if (og) {
          imageUrl = og;
          source = page;
          break;
        }
      }
    }
    if (!imageUrl || !source) continue;
    images.push({
      spotId: spot.id,
      imageUrl,
      imageSourceUrl: source,
      provider: "gemini-grounding",
    });
  }

  return {
    images,
    queries,
    searchEntryPointHtml,
    evidence: [
      evidenceOf({
        kind: "API",
        provider: "gemini-grounding",
        sourceRef: queries.join(" | ") || args.model,
        sourceField: "searchEntryPoint",
        fetchedAt,
        validFor: null,
        note: searchEntryPointHtml,
      }),
    ],
  };
}

function looksLikeImagePath(url: string): boolean {
  return /\.(avif|gif|jpe?g|png|webp)(\?|#|$)/i.test(url) || /googleusercontent|ggpht|fbcdn|cloudinary|wikipedia/.test(url);
}

async function fetchOgImage(pageUrl: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const res = await fetch(pageUrl, {
      headers: { Accept: "text/html", "User-Agent": "FutariLog/0.6 (grounded-image)" },
      redirect: "follow",
      signal: signal ?? AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    if (type.startsWith("image/")) return pageUrl;
    if (!type.includes("html") && type.length > 0) return null;
    const html = (await res.text()).slice(0, 400_000);
    return extractOgImage(html, pageUrl);
  } catch {
    return null;
  }
}
