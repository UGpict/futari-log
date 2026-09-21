import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Noto_Sans_JP } from "next/font/google";
import { AuthGate } from "@/components/auth-gate";
import "./globals.css";

const notoSansJp = Noto_Sans_JP({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-noto-sans-jp",
  display: "swap",
});

export const metadata: Metadata = {
  title: "FutariLog",
  description: "二人の希望を調整し、予定が崩れたら組み直し、確かめた記憶を次のデートに活かす",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="ja" className={`${notoSansJp.variable} h-full antialiased`}>
      <body className="min-h-full font-sans"><AuthGate>{children}</AuthGate></body>
    </html>
  );
}
