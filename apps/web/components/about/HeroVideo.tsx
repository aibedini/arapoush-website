"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import type { Img } from "@/lib/content/pick";
import styles from "./About.module.css";

type Props = { poster: Img; mp4: string; webm?: string | null; alt: string; play: string; pause: string; sizes: string };

/**
 * The factory film behind the about hero. First paint is only the poster (the page's LCP image); the
 * video's sources are attached once the page is idle or the visitor shows intent (scroll, pointer,
 * key), so it never competes with the first load. Reduced motion or Save-Data: the poster stays and
 * the button starts the film on request. The button pauses it at any time (WCAG 2.2.2).
 */
export default function HeroVideo({ poster, mp4, webm, alt, play, pause, sizes }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const [load, setLoad] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [wanted, setWanted] = useState(true);

  useEffect(() => {
    const calm = matchMedia("(prefers-reduced-motion: reduce)").matches || (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    if (calm) {
      setWanted(false);
      return;
    }
    let idle = 0;
    let timer = 0;
    const go = () => {
      cleanup();
      setLoad(true);
    };
    const intents = ["scroll", "pointerdown", "keydown", "touchstart"] as const;
    const cleanup = () => {
      intents.forEach((e) => removeEventListener(e, go));
      if (idle && "cancelIdleCallback" in window) cancelIdleCallback(idle);
      clearTimeout(timer);
    };
    intents.forEach((e) => addEventListener(e, go, { once: true, passive: true }));
    const afterLoad = () => {
      timer = window.setTimeout(() => {
        if ("requestIdleCallback" in window) idle = requestIdleCallback(go, { timeout: 2500 });
        else go();
      }, 1200);
    };
    if (document.readyState === "complete") afterLoad();
    else addEventListener("load", afterLoad, { once: true });
    return () => {
      cleanup();
      removeEventListener("load", afterLoad);
    };
  }, []);

  useEffect(() => {
    const v = video.current;
    if (!v || !load) return;
    v.load();
    if (wanted) v.play().catch(() => setWanted(false));
  }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (!load) {
      setWanted(true);
      setLoad(true);
      return;
    }
    if (v.paused) {
      setWanted(true);
      v.play().catch(() => {});
    } else {
      setWanted(false);
      v.pause();
    }
  };

  return (
    <div className={styles.media}>
      <div className={styles.frame} role="img" aria-label={alt}>
      <Image src={poster.src} alt="" fill priority fetchPriority="high" sizes={sizes} quality={70} className={styles.poster} data-no-mirror />
      <video
        ref={video}
        className={styles.video}
        data-on={playing || undefined}
        muted
        loop
        playsInline
        preload="none"
        aria-hidden="true"
        tabIndex={-1}
        onPlaying={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      >
        {load && webm ? <source src={webm} type="video/webm" /> : null}
        {load ? <source src={mp4} type="video/mp4" /> : null}
      </video>
      </div>
      <button type="button" className={styles.playBtn} onClick={toggle} aria-label={playing ? pause : play}>
        {playing ? (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 5h3v14H8zM13 5h3v14h-3z" fill="currentColor" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 5.5v13l11-6.5z" fill="currentColor" />
          </svg>
        )}
      </button>
    </div>
  );
}
