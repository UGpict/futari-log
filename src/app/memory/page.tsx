"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { MemoryScreen } from "@/features/memory/memory-screen";

function MemoryInner() {
  const search = useSearchParams();
  return <MemoryScreen coupleId={search.get("couple")} />;
}

export default function MemoryPage() {
  return (
    <Suspense fallback={<main className="p-8">読み込み中…</main>}>
      <MemoryInner />
    </Suspense>
  );
}