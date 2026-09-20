import { useId } from "react";

/** The create action's soft bean-shaped mark; the surrounding button owns its label. */
export function DateCreateMark({ className }: { className?: string }) {
  const gradientId = `date-create-${useId().replaceAll(":", "")}`;
  return (
    <svg className={className} viewBox="0 0 72 72" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="10" y1="7" x2="62" y2="66" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--action-primary-start)" />
          <stop offset=".55" stopColor="var(--action-primary-middle)" />
          <stop offset="1" stopColor="var(--action-primary-end)" />
        </linearGradient>
      </defs>
      <path d="M37 4C54 4 68 17 68 34C68 53 52 68 34 68C17 68 4 55 4 38C4 24 13 20 19 12C23 7 29 4 37 4Z" fill={`url(#${gradientId})`} />
      <path d="M36 24V48M24 36H48" stroke="var(--action-on-primary)" strokeWidth="7.5" strokeLinecap="round" />
    </svg>
  );
}
