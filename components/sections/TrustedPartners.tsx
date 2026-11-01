"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { gsap, ease, prefersReducedMotion } from "@/lib/animations/motion";
import { useIsoLayoutEffect } from "@/lib/animations/useIsoLayoutEffect";
import { SlidingNumber } from "@animate-ui/react/primitives/texts/sliding-number";
import { Magnetic } from "@animate-ui/react/primitives/effects/magnetic";
import type { SectionProps } from "@/lib/sections";
import { ChevronLeftBold, ChevronRightBold } from "@/components/ui/icons";
import styles from "./TrustedPartners.module.css";

/** Figures and column widths; labels come from t.partners.stats (same order). */
const stats = [
  { value: 20, suffix: "+", w: 171 },
  { value: 500, suffix: "+", w: 195 },
  { value: 2, suffix: "B+", w: 164 },
  { value: 99, suffix: "%", w: 176 },
];

const logos = [
  { src: "/images/logo-hydroderm.svg", alt: "Hydroderm", w: 189, h: 81 },
  { src: "/images/logo-cerita.png", alt: "Cerita Hair Care", w: 146, h: 97 },
  { src: "/images/logo-jute.png", alt: "Jute Cosmetics", w: 97, h: 97 },
  { src: "/images/logo-prime.png", alt: "Prime", w: 146, h: 97 },
  { src: "/images/logo-cerita.png", alt: "Cerita Hair Care", w: 146, h: 97 },
  { src: "/images/logo-hydroderm.svg", alt: "Hydroderm", w: 189, h: 81 },
];

export default function TrustedPartners({ t }: SectionProps) {
  const p = t.partners;
  const track = useRef<HTMLUListElement>(null);
  const busy = useRef(false);
  const [start, setStart] = useState(0);

  // Order is rotated after each slide so the loop never runs out of logos.
  const order = logos.map((_, i) => logos[(i + start) % logos.length]);

  const pendingPrev = useRef(0);

  // In RTL the row runs right → left, so the track travels the other way.
  const travel = () => (track.current && getComputedStyle(track.current).direction === "rtl" ? 1 : -1);

  useIsoLayoutEffect(() => {
    const el = track.current;
    if (!el) return;
    if (pendingPrev.current) {
      // Runs before paint, so the rotated-in logo never flashes.
      gsap.fromTo(el, { x: travel() * pendingPrev.current }, { x: 0, duration: 0.7, ease: ease.inOut, onComplete: () => void (busy.current = false) });
      pendingPrev.current = 0;
      return;
    }
    gsap.set(el, { x: 0 });
    busy.current = false;
  }, [start]);

  const slide = (dir: 1 | -1) => {
    const el = track.current;
    if (!el || busy.current) return;
    busy.current = true;
    const items = el.children;
    const reduce = prefersReducedMotion();

    if (dir === 1) {
      const w = (items[0] as HTMLElement).offsetWidth;
      if (reduce) return setStart((s) => (s + 1) % logos.length);
      gsap.to(el, { x: travel() * w, duration: 0.7, ease: ease.inOut, onComplete: () => setStart((s) => (s + 1) % logos.length) });
    } else {
      // Bring the previous logo in from the left: rotate first, then animate from its offset.
      if (!reduce) pendingPrev.current = (items[logos.length - 1] as HTMLElement).offsetWidth;
      setStart((s) => (s - 1 + logos.length) % logos.length);
    }
  };

  return (
    <section id="partners" className={styles.section} aria-labelledby="partners-title">
      <div className={styles.bg} aria-hidden="true">
        <div className={styles.bgInner} data-parallax="40">
          <Image src="/images/partners-bg.webp" alt="" fill sizes="100vw" className={styles.bgImg} />
        </div>
      </div>

      <div className="canvas" style={{ "--h": 1024 } as React.CSSProperties}>
        <div className={`at ${styles.intro}`} style={{ "--x": 48, "--y": 221, "--w": 600 } as React.CSSProperties}>
          <p className="eyebrow" data-reveal>
            {p.eyebrow}
          </p>
          <h2 id="partners-title" className="t-h2" data-reveal-lines>
            {p.title.map((line, i) => (
              <span key={line} className="line-mask">
                <span className={i > 0 ? "t-muted" : undefined}>{line}</span>
              </span>
            ))}
          </h2>
          <p className="t-lead" data-reveal>
            {p.lead[0]}
            <br className={styles.br} /> {p.lead[1]}
          </p>
        </div>

        <dl className={`at ${styles.stats}`} style={{ "--x": 52, "--y": 600, "--w": 931 } as React.CSSProperties} data-reveal-stagger>
          {stats.map((s, i) => (
            <div key={s.w} className={styles.stat} style={{ "--sw": s.w } as React.CSSProperties} data-reveal-item>
              <dt className={styles.statLabel}>
                {p.stats[i]?.label}
                <span className={styles.statSub}>{p.stats[i]?.sub}</span>
              </dt>
              <dd className={`${styles.statValue} ltr`}>
                {/* animate-ui odometer: digits roll up from 0 once the stat is in view */}
                <SlidingNumber number={s.value} fromNumber={0} inView inViewMargin="0px 0px -12% 0px" />
                <span>{s.suffix}</span>
              </dd>
            </div>
          ))}
        </dl>

        <div className={`at ${styles.bar}`} style={{ "--x": 48, "--y": 830, "--w": 1792 } as React.CSSProperties} data-reveal>
          <Magnetic strength={0.3} range={70}>
            <button type="button" className={styles.arrow} onClick={() => slide(-1)} aria-label={p.prev}>
              <ChevronLeftBold />
            </button>
          </Magnetic>
          <div className={styles.viewport}>
            <ul ref={track} className={styles.track} aria-label={p.brands} dir="ltr">
              {[...order, ...order].map((l, i) => (
                <li key={`${start}-${i}`} className={styles.logo} aria-hidden={i >= logos.length ? true : undefined}>
                  <Image
                    src={l.src}
                    alt={i >= logos.length ? "" : l.alt}
                    width={l.w}
                    height={l.h}
                    style={{ "--lw": l.w, "--lh": l.h } as React.CSSProperties}
                    draggable={false}
                    data-no-mirror
                  />
                </li>
              ))}
            </ul>
          </div>
          <Magnetic strength={0.3} range={70}>
            <button type="button" className={styles.arrow} onClick={() => slide(1)} aria-label={p.next}>
              <ChevronRightBold />
            </button>
          </Magnetic>
        </div>
      </div>
    </section>
  );
}
