"use client";

import { useParams } from "next/navigation";
import { ReplayScreen } from "@/features/replay/replay-screen";

export default function ReplayPage() {
  const params = useParams<{ id: string }>();
  return <ReplayScreen replayId={params.id} />;
}