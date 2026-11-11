"use client";

import { useEffect, useRef, useState } from "react";
import { SlidingNumber } from "@animate-ui/react/primitives/texts/sliding-number";
import { gsap, ease, registerGsap } from "@/lib/animations/motion";
import { startIntro, INTRO_SEEN_KEY } from "@/lib/animations/intro";
import styles from "./PageLoader.module.css";

const MAX_WAIT_MS = 4000; // never hold visitors longer than this

function waitForImage(img: HTMLImageElement) {
  if (img.complete) return Promise.resolve();
  return new Promise<void>((resolve) => {
    img.addEventListener("load", () => resolve(), { once: true });
    img.addEventListener("error", () => resolve(), { once: true });
  });
}

export default function PageLoader({ logo = "/images/logo.png" }: { logo?: string }) {
  const root = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLSpanElement>(null);
  // Discrete real progress (one step per finished asset); the odometer rolls between steps.
  const [pct, setPct] = useState(0);

  useEffect(() => {
    registerGsap();
    const el = root.current;
    const html = document.documentElement;

    if (!el || html.classList.contains("no-loader")) {
      startIntro();
      return;
    }

    let cancelled = false;
    html.style.overflow = "hidden";
    const release = () => {
      html.style.overflow = "";
    };
    const safety = window.setTimeout(release, MAX_WAIT_MS + 2500);

    const shown = { p: 0 };
    const render = () => {
      if (bar.current) bar.current.style.transform = `scaleX(${shown.p})`;
    };

    // Real loading state: webfonts + every hero image marked critical.
    const imgs = Array.from(document.querySelectorAll<HTMLImageElement>("img[data-critical]"));
    const tasks: Promise<unknown>[] = [document.fonts ? document.fonts.ready : Promise.resolve(), ...imgs.map(waitForImage)];
    let done = 0;
    const total = tasks.length;
    const toProgress = (p: number) =>
      gsap.to(shown, { p, duration: 0.45, ease: ease.ui, overwrite: true, onUpdate: render });

    tasks.forEach((t) =>
      t.then(() => {
        done += 1;
        if (cancelled) return;
        toProgress(done / total);
        setPct(Math.round((done / total) * 100));
      }),
    );

    const ready = Promise.race([
      Promise.all(tasks),
      new Promise((r) => window.setTimeout(r, MAX_WAIT_MS)),
    ]);

    let tl: gsap.core.Timeline | undefined;
    ready.then(() => {
      if (cancelled) return;
      setPct(100);
      tl = gsap.timeline({
        onComplete: () => {
          el.style.display = "none";
          release();
        },
      });
      tl.to(shown, { p: 1, duration: 0.35, ease: ease.ui, onUpdate: render })
        .to(`.${styles.inner}`, { y: -24, autoAlpha: 0, duration: 0.5, ease: ease.inOut }, "+=0.1")
        .addLabel("wipe", "-=0.2")
        .to(el, { clipPath: "inset(0% 0% 100% 0%)", duration: 0.95, ease: ease.inOut }, "wipe")
        .call(
          () => {
            release();
            startIntro();
            try {
              sessionStorage.setItem(INTRO_SEEN_KEY, "1");
            } catch {}
          },
          undefined,
          "wipe+=0.12",
        );
    });

    return () => {
      cancelled = true;
      tl?.kill();
      window.clearTimeout(safety);
      release();
    };
  }, []);

  return (
    <div ref={root} className={styles.loader} aria-hidden="true">
      <div className={styles.inner}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={styles.logo} src={logo} alt="" width={266} height={96} data-no-mirror />
        <div className={styles.meter}>
          <span ref={bar} className={styles.bar} />
        </div>
        <span className={styles.pct}>
          <SlidingNumber number={pct} transition={{ stiffness: 160, damping: 22, mass: 0.5 }} />
          <span className={styles.pctSign}>%</span>
        </span>
      </div>
    </div>
  );
}
