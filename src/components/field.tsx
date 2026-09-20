import type { ReactNode } from "react";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="text-ink-soft">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}