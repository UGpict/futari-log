import { notFound } from "next/navigation";

export const metadata = { title: "認証画面一覧 | FutariLog", robots: { index: false, follow: false } };

export default async function AuthDevelopmentPage() {
  if (process.env.NODE_ENV === "development") {
    const { AuthCatalog } = await import("@/features/development/auth-catalog");
    return <AuthCatalog />;
  }
  notFound();
}
