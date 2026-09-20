import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata = { title: "開発用ページ | FutariLog", robots: { index: false, follow: false } };

export default async function DevelopmentPage() {
  if (process.env.NODE_ENV === "development") {
    const { ComponentCatalog } = await import("@/features/development/component-catalog");
    const { readCatalog } = await import("@/features/development/read-catalog");
    return <ComponentCatalog {...await readCatalog()} />;
  }
  notFound();
}
