import type { ReactNode } from "react";

export function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-line bg-card p-4">
      <h2 className="font-medium">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}