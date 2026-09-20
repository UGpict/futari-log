import { useId } from "react";

export const moods = [
  { id: "happy", label: "うれしそう", color: "#ff797f" },
  { id: "relaxed", label: "くつろいでいた", color: "#b39cde" },
  { id: "tired", label: "疲れていそう", color: "#ffd352" },
  { id: "sad", label: "戸惑い・退屈そう", color: "#8aaee0" },
] as const;

export type Mood = (typeof moods)[number]["id"];

/** Shares the loading mascots' flat palette, rounded silhouettes, and soft charcoal faces. */
export function MoodSticker({ mood, className }: { mood: Mood; className?: string }) {
  const shadowId = `sticker-shadow-${useId().replaceAll(":", "")}`;
  const color = moods.find((item) => item.id === mood)!.color;
  return (
    <svg className={className} viewBox="0 0 136 120" fill="none" aria-hidden="true">
      <defs>
        <filter id={shadowId} x="-25%" y="-25%" width="150%" height="160%" colorInterpolationFilters="sRGB">
          <feDropShadow dx="0" dy="3" stdDeviation="1.8" floodColor="#604759" floodOpacity="0.22" />
        </filter>
      </defs>
      {mood === "happy" && <>
        <path d="M64 34C51 14 20 20 19 46C18 68 40 89 59 99Q64 102 69 99C88 89 110 68 109 46C108 20 77 14 64 34Z" fill={color} stroke="#fffdfb" strokeWidth="10" strokeLinejoin="round" paintOrder="stroke fill" filter={`url(#${shadowId})`} />
        <g stroke="#25272b" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M43 55C45 47 53 47 56 54M73 54C75 46 83 46 86 53" />
          <path d="M53 69C58 81 72 81 78 68" />
        </g>
      </>}
      {mood === "relaxed" && <>
        <path d="M66 15C88 12 105 28 109 49C113 72 99 90 78 97C57 104 27 98 19 82C10 63 21 42 37 29C47 21 56 16 66 15Z" fill={color} stroke="#fffdfb" strokeWidth="10" strokeLinejoin="round" paintOrder="stroke fill" filter={`url(#${shadowId})`} />
        <g stroke="#25272b" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M43 53C46 60 53 60 56 53M73 53C76 60 83 60 86 53" />
          <path d="M55 72C60 80 70 80 75 72" />
        </g>
      </>}
      {mood === "tired" && <>
        <path d="M55 22C59 15 69 15 74 23L109 82C115 93 109 101 97 101H31C19 101 13 93 19 82Z" fill={color} stroke="#fffdfb" strokeWidth="10" strokeLinejoin="round" paintOrder="stroke fill" filter={`url(#${shadowId})`} />
        <g stroke="#25272b" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M43 58C47 63 52 63 56 58M73 58C77 63 82 63 86 58" />
          <path d="M57 80Q65 76 73 80" />
        </g>
      </>}
      {mood === "sad" && <>
        <path d="M30 17L96 20Q110 21 109 35L106 86Q105 100 91 100L28 97Q15 96 16 83L18 31Q19 17 30 17Z" fill={color} stroke="#fffdfb" strokeWidth="10" strokeLinejoin="round" paintOrder="stroke fill" filter={`url(#${shadowId})`} />
        <g fill="#25272b">
          <ellipse cx="49" cy="58" rx="4.5" ry="5.5" />
          <ellipse cx="80" cy="58" rx="4.5" ry="5.5" />
        </g>
        <g stroke="#25272b" strokeWidth="5" strokeLinecap="round">
          <path d="M43 45L54 42M75 42L86 45M58 78H71" />
        </g>
      </>}
    </svg>
  );
}
