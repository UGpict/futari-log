"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { Rive } from "@rive-app/canvas";
import styles from "./rive-mascot.module.css";

const scenes = {
  weather: { src: "/animations/planning-weather.riv?v=1", poster: "/animations/planning-weather-static.svg", machine: "Weather", autoBind: false },
  memo: { src: "/animations/futari-memo.riv?v=bold-face-1", poster: "/animations/futari-memo-static.svg?v=bold-face-1", machine: "Memo", autoBind: true },
  suggestion: { src: "/animations/futari-suggestion.riv?v=gentle-2", poster: "/animations/futari-suggestion-static.svg?v=gentle-2", machine: "Suggestion", autoBind: false },
};

export function RiveMascot({ variant, nextCue = 0, active = true }: {
  variant: keyof typeof scenes; nextCue?: number; active?: boolean;
}) {
  const scene = scenes[variant];
  const enabled = useRef(active);
  const syncPlayback = useRef<(() => void) | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const player = useRef<Rive | null>(null);
  const reducedMotion = useRef(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    let disposed = false;
    let instance: Rive | null = null;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotion.current = preference.matches;
    let visible = true;
    const syncMotion = () => {
      reducedMotion.current = preference.matches;
      if (preference.matches || document.hidden || !enabled.current || !visible) instance?.pause();
      else instance?.play();
    };
    syncPlayback.current = syncMotion;
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      syncMotion();
    });
    intersection.observe(element);
    const observer = new ResizeObserver(() => instance?.resizeDrawingSurfaceToCanvas());
    observer.observe(element);
    preference.addEventListener("change", syncMotion);
    document.addEventListener("visibilitychange", syncMotion);

    void import("@rive-app/canvas").then(({ Rive, RuntimeLoader, Layout, Fit }) => {
      if (disposed) return;
      RuntimeLoader.setWasmUrl("/vendor/rive/rive.wasm");
      RuntimeLoader.setWasmFallbackUrl("/vendor/rive/rive_fallback.wasm");
      instance = new Rive({
        canvas: element,
        src: scene.src,
        stateMachine: scene.machine,
        autoBind: scene.autoBind,
        autoplay: !preference.matches && !document.hidden && enabled.current,
        layout: new Layout({ fit: Fit.Contain }),
        shouldDisableRiveListeners: true,
        enableRiveAssetCDN: false,
        onLoad: () => {
          if (disposed) return;
          instance?.resizeDrawingSurfaceToCanvas();
          player.current = instance;
          setReady(true);
          syncMotion();
        },
        onLoadError: () => { if (!disposed) setReady(false); },
      });
    }).catch(() => { /* The matching static illustration remains visible. */ });

    return () => {
      disposed = true;
      player.current = null;
      observer.disconnect();
      intersection.disconnect();
      syncPlayback.current = null;
      preference.removeEventListener("change", syncMotion);
      document.removeEventListener("visibilitychange", syncMotion);
      instance?.cleanup();
    };
  }, [scene]);

  useEffect(() => {
    enabled.current = active;
    syncPlayback.current?.();
  }, [active]);

  useEffect(() => {
    if (nextCue && !reducedMotion.current) player.current?.viewModelInstance?.trigger("next")?.trigger();
  }, [nextCue]);

  return (
    <span className={`${styles.mascot} ${styles[variant]}`} aria-hidden="true">
      <Image src={scene.poster} alt="" width={500} height={500}
        unoptimized loading={variant === "suggestion" ? "eager" : "lazy"} className={`${styles.visual} ${ready ? styles.hidden : ""}`} />
      <canvas ref={canvas} className={`${styles.visual} ${ready ? "" : styles.hidden}`} />
    </span>
  );
}
