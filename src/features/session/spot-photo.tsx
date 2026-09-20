"use client";

import { useState } from "react";
import Image from "next/image";
import type { SpotDto } from "@/contracts/session";
import styles from "./session.module.css";

export function SpotPhoto({ spot, fallback, label }: { spot?: SpotDto; fallback: string | null; label: string }) {
  const [failed, setFailed] = useState(false);
  const actual = !failed && spot?.imageUrl;
  const src = actual || (fallback ? `/images/itinerary/${fallback}.jpg` : null);
  if (!src) return null;
  return <>
    <div className={styles.spotImage}>
      <Image src={src} alt={actual ? spot!.name : `${label}のイメージ写真（実際の施設とは異なります）`} fill sizes="(max-width: 430px) 76vw, 330px" unoptimized={Boolean(actual)} referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      {!actual && <span className={styles.photoLabel}>イメージ</span>}
    </div>
    {actual && <div className={styles.photoCredits}>
      {spot?.imageSourceUrl && <a href={spot.imageSourceUrl} target="_blank" rel="noreferrer">写真の出典</a>}
      {spot?.imageAttributions?.map((author, index) => <span key={`${author.displayName}-${index}`}>写真: {author.uri ? <a href={author.uri} target="_blank" rel="noreferrer">{author.displayName}</a> : author.displayName}</span>)}
    </div>}
  </>;
}
