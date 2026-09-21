"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";

import { FutariLogo } from "./futari-logo";
import { readAuthEntry } from "@/client/auth-entry";

const publicPrefixes = ["/auth", "/dev"];

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("futarilog:auth-entry-change", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("futarilog:auth-entry-change", callback);
  };
}

export function AuthGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isPublic = publicPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  const hasAuthEntry = useSyncExternalStore(subscribe, () => Boolean(readAuthEntry()), () => false);

  useEffect(() => {
    if (!isPublic && !hasAuthEntry) router.replace("/auth");
  }, [hasAuthEntry, isPublic, router]);

  if (!isPublic && !hasAuthEntry) {
    return <main className="grid min-h-svh place-items-center" aria-label="認証状態を確認しています"><FutariLogo className="h-auto w-36" /></main>;
  }
  return children;
}
