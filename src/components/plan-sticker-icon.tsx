import { useId } from "react";

/** Illustrated plan facts, with the same cut-paper edge as mood stickers. */
export function PlanStickerIcon({ kind }: { kind: "time" | "budget" | "spots" | "wave" | "calendar" | "start" | "goal" | "walk" | "drive" | "transit" }) {
  const shadow = `plan-sticker-${useId().replaceAll(":", "")}`;
  return <svg viewBox="0 0 80 84" fill="none" aria-hidden="true">
    <defs><filter id={shadow} x="-30%" y="-30%" width="160%" height="170%" colorInterpolationFilters="sRGB"><feDropShadow dx="0" dy="2.5" stdDeviation="1.3" floodColor="#63594e" floodOpacity=".23" /></filter></defs>
    <g filter={`url(#${shadow})`} strokeLinejoin="round">
      {kind === "wave" && <>
        <path d="M31 69L24 59L13 43C9 37 16 32 20 37L27 45L20 22C18 15 26 13 28 19L35 37L31 14C30 7 39 6 40 13L44 35L45 17C45 10 54 11 53 18L53 39L58 28C61 22 68 26 65 32L61 51C59 60 54 64 51 70Z" fill="#dfb98d" stroke="#fffdfb" strokeWidth="5.5" />
        <path d="M28 46Q38 42 42 53" stroke="#b28a67" strokeWidth="3" strokeLinecap="round" />
        <path d="M30 69L51 70" stroke="#8fa89b" strokeWidth="8" strokeLinecap="round" />
        <path d="M9 20L6 14M64 12L68 8" stroke="#8fa89b" strokeWidth="4" strokeLinecap="round" />
      </>}
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
        <circle cx="40" cy="18" r="10" fill="#dc927b" stroke="#fffdfb" strokeWidth="6" />
        <path d="M39 31L35 48M36 38L24 48M38 38L51 46M35 48L24 67M35 48L49 65" stroke="#dc927b" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
      </>}
      {kind === "drive" && <>
        <path d="M17 36L23 20Q25 15 31 15H50Q56 15 58 20L64 36Q69 41 69 48V64Q69 69 64 69H58Q53 69 53 64V61H28V64Q28 69 23 69H17Q12 69 12 64V48Q12 41 17 36Z" fill="#78a69b" stroke="#fffdfb" strokeWidth="6" />
        <path d="M25 34L29 22H52L56 34Z" fill="#eaf3ef" />
        <circle cx="24" cy="48" r="5" fill="#fff8ee" />
        <circle cx="57" cy="48" r="5" fill="#fff8ee" />
        <path d="M34 49H47" stroke="#d5e6df" strokeWidth="5" strokeLinecap="round" />
      </>}
      {kind === "transit" && <>
        <path d="M19 15Q19 9 26 9H55Q62 9 62 15V58Q62 65 55 65H26Q19 65 19 58Z" fill="#7f91bd" stroke="#fffdfb" strokeWidth="6" />
        <path d="M33 16H48" stroke="#eaf2f6" strokeWidth="5" strokeLinecap="round" />
        <path d="M26 25H55V43H26Z" fill="#eaf2f6" />
        <circle cx="28" cy="53" r="4.5" fill="#fff8ee" />
        <circle cx="53" cy="53" r="4.5" fill="#fff8ee" />
        <path d="M28 72L35 62M53 72L46 62M31 68H50" stroke="#616d8e" strokeWidth="5" strokeLinecap="round" />
      </>}
    </g>
  </svg>;
}
