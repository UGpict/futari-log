import { useId } from "react";

/** Illustrated plan facts, with the same cut-paper edge as mood stickers. */
export function PlanStickerIcon({ kind }: { kind: "time" | "budget" | "spots" | "calendar" | "start" | "goal" | "walk" | "drive" | "transit" }) {
  const shadow = `plan-sticker-${useId().replaceAll(":", "")}`;
  return <svg viewBox="0 0 80 84" fill="none" aria-hidden="true">
    <defs><filter id={shadow} x="-30%" y="-30%" width="160%" height="170%" colorInterpolationFilters="sRGB"><feDropShadow dx="0" dy="2.5" stdDeviation="1.3" floodColor="#63594e" floodOpacity=".23" /></filter></defs>
    <g filter={`url(#${shadow})`} strokeLinejoin="round">
      {kind === "time" && <>
        <circle cx="40" cy="39" r="29" fill="#dc9183" stroke="#fffdfb" strokeWidth="6" />
        <circle cx="40" cy="39" r="21.5" fill="#fff8ee" />
        <path d="M40 24V39L51 46" stroke="#53534d" strokeWidth="5" strokeLinecap="round" />
        <circle cx="40" cy="39" r="3.5" fill="#53534d" />
        <path d="M24 18L27 16" stroke="#efc0af" strokeWidth="4" strokeLinecap="round" />
      </>}
      {kind === "budget" && <>
        <path d="M16 25Q16 20 22 20L57 13Q62 12 62 18V32H16Z" fill="#8fa89b" stroke="#fffdfb" strokeWidth="6" />
        <path d="M28 28L35 12L52 18L49 32Z" fill="#e5d9b7" stroke="#fffdfb" strokeWidth="5" />
        <path d="M17 27H61Q68 27 68 35V60Q68 68 60 68H20Q12 68 12 60V35Q12 27 17 27Z" fill="#cfac79" stroke="#fffdfb" strokeWidth="6" />
        <path d="M55 39H68V56H55Q47 56 47 48Q47 39 55 39Z" fill="#ead8b9" />
        <circle cx="56" cy="48" r="3" fill="#53534d" />
        <path d="M22 36H38" stroke="#e6cba5" strokeWidth="4" strokeLinecap="round" />
      </>}
      {kind === "spots" && <>
        <path d="M40 10C25 10 14 21 14 36C14 48 30 63 36 69Q40 73 44 69C50 63 66 48 66 36C66 21 55 10 40 10Z" fill="#86a89a" stroke="#fffdfb" strokeWidth="6" />
        <circle cx="40" cy="35" r="10" fill="#fff8ee" />
        <path d="M23 27Q26 20 32 19" stroke="#bdd1c4" strokeWidth="4" strokeLinecap="round" />
      </>}
      {kind === "calendar" && <>
        <path d="M15 22Q15 16 22 16H57Q64 16 64 22V60Q64 67 57 67H22Q15 67 15 60Z" fill="#fff8f2" stroke="#fffdfb" strokeWidth="7" />
        <path d="M15 22Q15 16 22 16H57Q64 16 64 22V33H15Z" fill="#dc7b72" />
        <path d="M27 11V23M52 11V23" stroke="#a9605f" strokeWidth="7" strokeLinecap="round" />
        <path d="M29 49L37 56L52 41" stroke="#d36e69" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      </>}
      {kind === "start" && <>
        <path d="M40 10C25 10 14 21 14 36C14 49 29 64 36 71Q40 75 44 71C51 64 66 49 66 36C66 21 55 10 40 10Z" fill="#86a89a" stroke="#fffdfb" strokeWidth="6" />
        <circle cx="40" cy="35" r="10" fill="#fff6ef" />
        <path d="M23 27Q26 20 32 19" stroke="#bdd1c4" strokeWidth="4" strokeLinecap="round" />
      </>}
      {kind === "goal" && <>
        <path d="M19 8Q25 8 25 14V16H68V47H25V72H13V14Q13 8 19 8Z" fill="#59645f" stroke="#fffdfb" strokeWidth="7" />
        <path d="M22 18H65V44H22Z" fill="#dc716d" />
        <path d="M60 20V42" stroke="#ed8d83" strokeWidth="6" strokeLinecap="round" />
      </>}
      {kind === "walk" && <>
        <path d="M29 9C17 7 11 21 12 32C12 40 17 45 17 53C17 60 21 64 27 63C33 62 36 57 35 51C34 44 37 36 39 28C42 17 38 10 29 9Z M53 24C65 22 71 36 70 47C70 55 65 60 65 68C65 75 61 79 55 78C49 77 46 72 47 66C48 59 45 51 43 43C40 32 44 25 53 24Z" fill="#dc927b" stroke="#fffdfb" strokeWidth="6" paintOrder="stroke fill" />
        <path d="M19 47L32 46M50 61L63 62" stroke="#fff1e8" strokeWidth="4" strokeLinecap="round" />
      </>}
      {kind === "drive" && <>
        <path d="M16 38L22 23Q24 17 31 17H49Q56 17 58 23L64 38Q68 41 68 48V63Q68 69 62 69H59Q54 69 54 64V62H26V64Q26 69 21 69H18Q12 69 12 63V48Q12 41 16 38Z" fill="#78a69b" stroke="#fffdfb" strokeWidth="6" />
        <path d="M24 36L29 24H51L56 36Z" fill="#eaf3ef" />
        <circle cx="23" cy="49" r="3.8" fill="#fff8ee" />
        <circle cx="57" cy="49" r="3.8" fill="#fff8ee" />
        <path d="M34 50H46" stroke="#d5e6df" strokeWidth="4" strokeLinecap="round" />
      </>}
      {kind === "transit" && <>
        <path d="M27 15Q40 12 53 15Q67 17 67 29V47Q67 58 56 59L61 65Q64 69 60 71Q56 73 53 69L49 64H31L27 69Q24 73 20 71Q16 69 19 65L24 59Q13 58 13 47V29Q13 17 27 15Z" fill="#8ea8b9" stroke="#fffdfb" strokeWidth="6" paintOrder="stroke fill" />
        <path d="M26 23H37V42H21V29Q21 23 26 23Z M43 23H54Q59 23 59 29V42H43Z" fill="#eaf3ef" />
        <circle cx="25" cy="51" r="3.5" fill="#fff8ee" />
        <circle cx="55" cy="51" r="3.5" fill="#fff8ee" />
      </>}
    </g>
  </svg>;
}
