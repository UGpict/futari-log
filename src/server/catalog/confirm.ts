import type { CatalogFieldEvidence, ConfirmationStatus } from "@/contracts/catalog";
import { jaDateInText, pageContains } from "./extract";

export type FieldDraft = {
  value: string | null;
  sourceUrl: string | null;
  quote: string | null;
};

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function evidenceInBody(value: string, body: string): string | null {
  if (pageContains(body, value)) return value;
  return jaDateInText(body, value);
}

export function confirmField(
  field: FieldDraft,
  bodies: Map<string, string>,
  fetchedAtByUrl: Map<string, string>,
): CatalogFieldEvidence {
  const value = field.value && field.value !== "UNKNOWN" ? normalize(field.value) : null;
  if (!value) {
    return { value: null, confirmation: "UNKNOWN", sourceUrl: field.sourceUrl ?? null, quote: field.quote, fetchedAt: null };
  }

  const preferred = field.sourceUrl ? [field.sourceUrl] : [];
  const urls = [...preferred, ...bodies.keys()].filter((url, i, all) => all.indexOf(url) === i);

  for (const url of urls) {
    const body = bodies.get(url);
    if (!body) continue;
    const quote = field.quote ? normalize(field.quote).slice(0, 280) : null;
    const fetchedAt = fetchedAtByUrl.get(url) ?? null;
    if (quote && pageContains(body, quote)) {
      return { value, confirmation: "VERIFIED", sourceUrl: url, quote, fetchedAt };
    }
    const hit = evidenceInBody(value, body);
    if (hit) {
      return { value, confirmation: "VERIFIED", sourceUrl: url, quote: hit, fetchedAt };
    }
  }

  if (field.sourceUrl && bodies.has(field.sourceUrl)) {
    return {
      value,
      confirmation: "PARTIAL",
      sourceUrl: field.sourceUrl,
      quote: field.quote,
      fetchedAt: fetchedAtByUrl.get(field.sourceUrl) ?? null,
    };
  }
  return { value, confirmation: "UNKNOWN", sourceUrl: field.sourceUrl ?? null, quote: field.quote, fetchedAt: null };
}

export function preferVerified(
  page: CatalogFieldEvidence,
  structured: CatalogFieldEvidence,
): CatalogFieldEvidence {
  if (page.confirmation === "VERIFIED") return page;
  if (structured.confirmation === "VERIFIED") return structured;
  if (page.value) return page;
  return structured;
}

export function rollupConfirmation(fields: { confirmation: ConfirmationStatus }[]): ConfirmationStatus {
  if (fields.some((f) => f.confirmation === "VERIFIED")) {
    return fields.every((f) => f.confirmation === "VERIFIED") ? "VERIFIED" : "PARTIAL";
  }
  if (fields.some((f) => f.confirmation === "PARTIAL")) return "PARTIAL";
  return "UNKNOWN";
}

export function planEligible(fields: {
  title: CatalogFieldEvidence;
  periodStart: CatalogFieldEvidence;
  periodEnd: CatalogFieldEvidence;
}): boolean {
  return (
    fields.title.confirmation === "VERIFIED" &&
    fields.periodStart.confirmation === "VERIFIED" &&
    fields.periodEnd.confirmation === "VERIFIED"
  );
}
