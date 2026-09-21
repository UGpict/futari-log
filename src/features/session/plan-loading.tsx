"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { RiveMascot } from "@/components/rive-mascot";
import styles from "./session.module.css";

const agents = [
  { message: "天気を調べています", tickerMessage: "天気を確認中", character: "weather" },
  { message: "お店を探しています", tickerMessage: "お店を検索中", character: "shop" },
  { message: "道順を調べています", tickerMessage: "道順を確認中", character: "route" },
  { message: "プランを考えています", tickerMessage: "プランを考え中", character: "plan" },
];

export function PlanningAgentArt({ character }: { character: string }) {
  return <span className={styles.simpleAgentArt}>{character === "weather" ? <RiveMascot variant="weather" /> : <Image src={`/animations/planning-${character}-static.svg`} alt="" width={40} height={40} unoptimized />}</span>;
}

export function PlanningAgentProgress() {
  const [visibleCount, setVisibleCount] = useState(1);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setVisibleCount((current) => {
        if (current >= agents.length) {
          window.clearInterval(timer);
          return current;
        }
        return current + 1;
      });
    }, 850);
    return () => window.clearInterval(timer);
  }, []);

  return <section className={styles.planningProgress} role="status" aria-live="polite">
    <div className={styles.planningProgressList}>
      {agents.slice(0, visibleCount).map((agent, index) => <div key={agent.character} className={styles.planningProgressRow} style={{ animationDelay: `${index * 40}ms` }}>
        <PlanningAgentArt character={agent.character} />
        <p><strong>{agent.message}</strong><span className={styles.dots}><i /><i /><i /></span></p>
      </div>)}
    </div>
  </section>;
}

export function PlanningAgentTicker() {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % agents.length);
    }, 3800);
    return () => window.clearInterval(timer);
  }, []);

  const agent = agents[activeIndex];
  return <div className={styles.planningAgentTicker} role="status" aria-live="polite" aria-label={agent.message}>
    <span key={agent.character} className={styles.planningAgentTickerInner}>
      <PlanningAgentArt character={agent.character} />
      <span className={styles.planningTickerCopy}><strong>{Array.from(agent.tickerMessage).map((character, index) => <i key={`${character}-${index}`} style={{ animationDelay: `${index * 70}ms` }}>{character}</i>)}</strong><span className={styles.dots}><i /><i /><i /></span></span>
    </span>
  </div>;
}

export function PlanLoading({ demo = false, compact = false }: { demo?: boolean; compact?: boolean }) {
  return <div className={`${styles.loading} ${compact ? styles.loadingCompact : ""}`} role="status" aria-label="プランを準備しています">
    {!compact && <><div className={styles.loadingMascot}><RiveMascot variant="flight" /></div><h1 className={styles.loadingLead}>ふたりのプランを考えはじめます</h1></>}
    {compact && <div className={styles.agentList} aria-hidden="true">{agents.map((agent, index) => <div key={agent.character} className={styles.agentRow} style={{ animationDelay: `${index * 350}ms` }}>
      <PlanningAgentArt character={agent.character} />
      <span>{demo ? agent.message : "プランを準備しています"}<span className={styles.dots}><i /><i /><i /></span></span>
    </div>)}</div>}
  </div>;
}
