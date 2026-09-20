"use client";

import { RiveMascot } from "./rive-mascot";

export function MemoMascot({ nextCue }: { nextCue: number }) {
  return <RiveMascot variant="memo" nextCue={nextCue} />;
}
