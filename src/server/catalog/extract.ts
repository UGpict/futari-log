import type { CatalogFieldEvidence, ConfirmationStatus } from "@/contracts/catalog";

export type PageFacts = {
  title: CatalogFieldEvidence;
  periodStart: CatalogFieldEvidence;
  periodEnd: CatalogFieldEvidence;
  hoursOpen: CatalogFieldEvidence;
  hoursClose: CatalogFieldEvidence;
  fridayClose: CatalogFieldEvidence;
  closedDays: CatalogFieldEvidence;
  venue: CatalogFieldEvidence;
  fee: CatalogFieldEvidence;
};

function field(
  value: string | null,
  confirmation: ConfirmationStatus,
  sourceUrl: string,
  quote: string | null,
  fetchedAt: string,
): CatalogFieldEvidence {
  return { value, confirmation, sourceUrl, quote, fetchedAt };
}

function unknown(): CatalogFieldEvidence {
  return { value: null, confirmation: "UNKNOWN", sourceUrl: null, quote: null, fetchedAt: null };
}

function isoFromJa(year: string, month: string, day: string): string {
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function padTime(raw: string): string {
  const [h, m] = raw.split(":");
  return `${h.padStart(2, "0")}:${m}`;
}

export function isGroundingRedirect(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "vertexaisearch.cloud.google.com" || host.endsWith(".vertexaisearch.cloud.google.com");
  } catch {
    return true;
  }
}

export function pickOfficialPage(
  bodies: Map<string, string>,
  preferred: string | null,
  title?: string | null,
): string | null {
  const mentionsTitle = (url: string) => !title || pageContains(bodies.get(url) ?? "", title);
  const candidates = [...bodies.keys()].filter((url) => !isGroundingRedirect(url) && mentionsTitle(url));
  if (preferred && !candidates.includes(preferred) && mentionsTitle(preferred) && bodies.has(preferred) && !isGroundingRedirect(preferred)) {
    candidates.push(preferred);
  }
  const score = (url: string): number => {
    const text = bodies.get(url) ?? "";
    let value = 0;
    if (/\/exhibition\//i.test(url) || /\/exhibitions?\//i.test(url)) value += 4;
    if (/\d{4}年\d{1,2}月\d{1,2}日/.test(text) && /開館時間/.test(text)) value += 2;
    if (/休館日/.test(text) && /曜日/.test(text)) value += 3;
    if (preferred && url === preferred) value += 1;
    return value;
  };
  return [...candidates].sort((a, b) => score(b) - score(a) || b.length - a.length)[0] ?? null;
}

export function pageContains(text: string, value: string): boolean {
  const hay = text.replace(/\s+/g, " ");
  const needle = value.replace(/\s+/g, " ").trim();
  return needle.length > 0 && hay.includes(needle);
}

export function bodiesMentioning(bodies: Map<string, string>, title: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const [url, text] of bodies) {
    if (pageContains(text, title)) out.set(url, text);
  }
  return out;
}

export function jaDateInText(text: string, iso: string): string | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const ja = `${m[1]}年${Number(m[2])}月${Number(m[3])}日`;
  return text.replace(/\s+/g, " ").includes(ja) ? ja : null;
}

export function extractFactsFromPage(
  text: string,
  sourceUrl: string,
  fetchedAt: string,
  hints?: { title?: string | null; venue?: string | null },
): PageFacts {
  const blank = unknown();
  if (hints?.title && !pageContains(text, hints.title)) {
    return {
      title: blank,
      periodStart: blank,
      periodEnd: blank,
      hoursOpen: blank,
      hoursClose: blank,
      fridayClose: blank,
      closedDays: blank,
      venue: blank,
      fee: blank,
    };
  }
  const period = text.match(/(\d{4})年(\d{1,2})月(\d{1,2})日[^0-9]{0,24}?(\d{1,2})月(\d{1,2})日/);
  const hours = text.match(/開館時間[^0-9]{0,12}(\d{1,2}:\d{2})\s*[-–〜～]\s*(\d{1,2}:\d{2})/);
  const friday = text.match(/金曜日は(\d{1,2}:\d{2})/);
  const closedMatch = text.match(/休館日\s*[:：]?\s*(.+?)(?=\s*開館時間|\s*入館料|$)/);
  const closedValue = closedMatch?.[1]?.replace(/\s+/g, " ").trim() || null;
  const closedYear = period?.[1] ? Number(period[1]) : Number(fetchedAt.slice(0, 4));
  const closedOk = Boolean(closedValue && parseClosedRule(closedValue, closedYear));
  const feeBlock = text.match(/入館料.{0,240}?((?:一般|高校|大学生|中学生)[^。]{0,80}円[^。]{0,40})/);
  const yen = text.match(/(一般[^\d]{0,8}[0-9,]+円.{0,48}(?:高校|大学).{0,24}[0-9,]+円)/);
  const year = period?.[1];
  const titleHint = hints?.title?.trim() || null;
  const venueHint = hints?.venue?.trim() || null;

  return {
    title:
      titleHint && pageContains(text, titleHint)
        ? field(titleHint, "VERIFIED", sourceUrl, titleHint, fetchedAt)
        : blank,
    periodStart:
      period && year
        ? field(isoFromJa(year, period[2], period[3]), "VERIFIED", sourceUrl, period[0], fetchedAt)
        : blank,
    periodEnd:
      period && year
        ? field(isoFromJa(year, period[4], period[5]), "VERIFIED", sourceUrl, period[0], fetchedAt)
        : blank,
    hoursOpen: hours ? field(padTime(hours[1]), "VERIFIED", sourceUrl, hours[0], fetchedAt) : blank,
    hoursClose: hours ? field(padTime(hours[2]), "VERIFIED", sourceUrl, hours[0], fetchedAt) : blank,
    fridayClose: friday ? field(padTime(friday[1]), "VERIFIED", sourceUrl, friday[0], fetchedAt) : blank,
    closedDays: closedOk && closedValue && closedMatch
      ? field(closedValue, "VERIFIED", sourceUrl, closedMatch[0], fetchedAt)
      : blank,
    venue:
      venueHint && pageContains(text, venueHint)
        ? field(venueHint, "VERIFIED", sourceUrl, venueHint, fetchedAt)
        : pageContains(text, "東京ステーションギャラリー")
          ? field("東京ステーションギャラリー", "VERIFIED", sourceUrl, "東京ステーションギャラリー", fetchedAt)
          : blank,
    fee: feeBlock
      ? field(feeBlock[1].replace(/\s+/g, " ").trim(), "VERIFIED", sourceUrl, feeBlock[1], fetchedAt)
      : yen
        ? field(yen[1].replace(/\s+/g, " ").trim(), "VERIFIED", sourceUrl, yen[1], fetchedAt)
        : blank,
  };
}

export function parseClosedRule(
  closedText: string | null,
  year: number,
): { weekdays: number[]; exceptionOpen: string[]; extraClosed: string[] } | null {
  if (!closedText) return null;
  const weekdays: number[] = [];
  if (closedText.includes("月曜日")) weekdays.push(1);
  if (closedText.includes("火曜日")) weekdays.push(2);
  if (closedText.includes("水曜日")) weekdays.push(3);
  if (closedText.includes("木曜日")) weekdays.push(4);
  if (closedText.includes("金曜日")) weekdays.push(5);
  if (closedText.includes("土曜日")) weekdays.push(6);
  if (closedText.includes("日曜日")) weekdays.push(0);
  if (!weekdays.length && !/\d{1,2}\/\d{1,2}/.test(closedText)) return null;
  const exceptionOpen: string[] = [];
  const extraClosed: string[] = [];
  const toDates = (text: string): string[] => {
    const out: string[] = [];
    for (const part of text.matchAll(/(\d{1,2})\/(\d{1,2})/g)) {
      out.push(`${year}-${part[1].padStart(2, "0")}-${part[2].padStart(2, "0")}`);
    }
    return out;
  };
  const exceptClause = closedText.match(/ただし([^。］\]]*は開館)/);
  if (exceptClause) exceptionOpen.push(...toDates(exceptClause[1]));
  const afterExcept = exceptClause
    ? closedText.slice(closedText.indexOf(exceptClause[0]) + exceptClause[0].length)
    : closedText;
  extraClosed.push(...toDates(afterExcept).filter((d) => !exceptionOpen.includes(d)));
  return { weekdays, exceptionOpen, extraClosed };
}

export function isClosedOnDate(
  rule: { weekdays: number[]; exceptionOpen: string[]; extraClosed: string[] },
  dateTokyo: string,
  weekday: number,
): boolean {
  if (rule.exceptionOpen.includes(dateTokyo)) return false;
  if (rule.extraClosed.includes(dateTokyo)) return true;
  return rule.weekdays.includes(weekday);
}
