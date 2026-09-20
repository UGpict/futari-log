import { timingSafeEqual } from "node:crypto";

export function workflowHeaderOk(header: string | null, secret: string | null): boolean {
  if (!secret || !header) return false;
  const left = Buffer.from(header);
  const right = Buffer.from(secret);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
