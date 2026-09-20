"use client";

import Image from "next/image";
import { RiveMascot } from "@/components/rive-mascot";
import { MemoMascot } from "@/components/memo-mascot";
import styles from "./session.module.css";

const agents = [
  { message: "天気を調べています", character: "weather" },
  { message: "お店を探しています", character: "shop" },
  { message: "道順を調べています", character: "route" },
  { message: "プランを考えています", character: "plan" },
];

export function PlanningAgentArt({ character }: { character: string }) {
  return <span className={styles.simpleAgentArt}>{character === "weather" ? <RiveMascot variant="weather" /> : <Image src={`/animations/planning-${character}-static.svg`} alt="" width={40} height={40} unoptimized />}</span>;
}

export function PlanLoading({ demo = false, compact = false }: { demo?: boolean; compact?: boolean }) {
  return <div className={`${styles.loading} ${compact ? styles.loadingCompact : ""}`} role="status" aria-label="プランを準備しています">
    <div className={styles.loadingMascot}><MemoMascot nextCue={0} /></div>
    <h1>プランを準備しています</h1>
    <div className={styles.agentList} aria-hidden="true">{agents.map((agent, index) => <div key={agent.character} className={styles.agentRow} style={{ animationDelay: `${index * 350}ms` }}>
      <PlanningAgentArt character={agent.character} />
      <span>{demo ? agent.message : "プランを準備しています"}<span className={styles.dots}><i /><i /><i /></span></span>
    </div>)}</div>
  </div>;
}
