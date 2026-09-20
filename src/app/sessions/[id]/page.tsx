"use client";

import { useParams } from "next/navigation";
import { SessionScreen } from "@/features/session/session-screen";

export default function SessionPage() {
  const params = useParams<{ id: string }>();
  return <SessionScreen sessionId={params.id} />;
}