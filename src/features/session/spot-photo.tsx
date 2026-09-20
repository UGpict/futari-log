"use client";

import { useState } from "react";
import Image from "next/image";
import { isVenuePlaceId, type PlacePhoto } from "@/contracts";
import { fixturesEnabled } from "@/client/api";
import styles from "./session.module.css";

type Visual = { image: string | null; label: string };

export function SpotCardImage({
  spotId,
  name,
  visual,
  photo,
  loading,
}: {
  spotId: string;
  name: string;
  visual: Visual;
  photo?: PlacePhoto;
  loading: boolean;
}) {
  const [broken, setBroken] = useState(false);
  const usePlaces = !fixturesEnabled() && isVenuePlaceId(spotId);
  if (!usePlaces) {
    if (!visual.image) return null;
    return (
      <div className={styles.spotImage}>
        <Image
          src={`/images/itinerary/${visual.image}.jpg`}
          alt={`${visual.label}のイメージ写真（実際の施設とは異なります）`}
          fill
          sizes="(max-width: 430px) 76vw, 330px"
        />
        <span className={styles.photoLabel}>イメージ</span>
      </div>
    );
  }

  const ready = photo?.state === "ready" && photo.imageUrl && !broken;
  if (loading && !photo) {
    return <div className={styles.spotImage} aria-hidden="true"><span className={styles.spotImageSkeleton} /></div>;
  }
  if (ready && photo.imageUrl) {
    const author = photo.authorAttributions.find((row) => row.displayName);
    const image = (
      // Places 写真は next/image 最適化キャッシュに載せない
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photo.imageUrl}
        alt={`${name}の写真`}
        loading="lazy"
        decoding="async"
        onError={() => setBroken(true)}
      />
    );
    return (
      <div className={styles.spotImage}>
        {photo.googleMapsUri ? (
          <a className={styles.spotPhotoLink} href={photo.googleMapsUri} target="_blank" rel="noreferrer">
            {image}
          </a>
        ) : (
          image
        )}
        <span className={styles.photoLabel}>
          {author?.displayName ? (
            <>
              {author.uri ? (
                <a href={author.uri} target="_blank" rel="noreferrer">{author.displayName}</a>
              ) : (
                author.displayName
              )}
              <span aria-hidden="true"> · </span>
            </>
          ) : null}
          Google
        </span>
      </div>
    );
  }

  return (
    <div className={styles.spotImage}>
      <div className={styles.spotImageFallback}>
        <small>{visual.label}</small>
        <strong>{name || "立ち寄りスポット"}</strong>
      </div>
    </div>
  );
}
