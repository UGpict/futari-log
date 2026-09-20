import { fetchPublicHttps } from "../src/server/catalog/fetchSource";
import { extractFactsFromPage } from "../src/server/catalog/extract";

async function main() {
  const url = "https://www.ejrcf.or.jp/gallery/exhibition/202609_suikoden.html";
  const fetched = await fetchPublicHttps(url);
  const facts = fetched.ok
    ? extractFactsFromPage(fetched.text, fetched.finalUrl ?? url, new Date().toISOString(), {
        title: "水滸伝",
        venue: "東京ステーションギャラリー",
      })
    : null;
  console.log(
    JSON.stringify(
      {
        ok: fetched.ok,
        status: fetched.status,
        finalHost: fetched.finalUrl ? new URL(fetched.finalUrl).host : null,
        bytes: fetched.bytes,
        error: fetched.error,
        hasTitle: fetched.text.includes("水滸伝"),
        hasPeriodJa: fetched.text.includes("2026年9月19日"),
        hasNov8: /11月8日/.test(fetched.text),
        hasHours: fetched.text.includes("10:00") && fetched.text.includes("18:00"),
        hasClosed: fetched.text.includes("休館日"),
        hasVenue: fetched.text.includes("ステーションギャラリー") || fetched.text.includes("東京ステーション"),
        hasYen: /[0-9,]+\s*円/.test(fetched.text),
        yenSample: fetched.text.match(/[0-9,]{3,}\s*円/g)?.slice(0, 6) ?? [],
        facts,
      },
      null,
      2,
    ),
  );
}

void main();
