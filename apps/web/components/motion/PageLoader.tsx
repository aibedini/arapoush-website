"use client";

import { useEffect, useRef } from "react";
import { gsap, ease, registerGsap } from "@/lib/animations/motion";
import { startIntro, INTRO_SEEN_KEY } from "@/lib/animations/intro";
import styles from "./PageLoader.module.css";

const MAX_WAIT_MS = 4000; // never hold visitors longer than this
const LAYERS = 3; // the exit splits into the three layers of a multi-layer tube

function waitForImage(img: HTMLImageElement) {
  if (img.complete) return Promise.resolve();
  return new Promise<void>((resolve) => {
    img.addEventListener("load", () => resolve(), { once: true });
    img.addEventListener("error", () => resolve(), { once: true });
  });
}

/**
 * First-visit loader, "extrusion": on deep navy, the white logo is revealed in reading direction as
 * real assets finish (fonts and hero images marked data-critical), three layer lines fill like the
 * PE / EVOH / PE walls of a tube, and an odometer counts to 100. The exit splits the screen into
 * three layers that run off in reading direction, and the hero intro starts underneath.
 * Shown once per session; skipped with reduced motion (see the inline script in the layout).
 * Only transform, opacity and clip-path animate.
 */
export default function PageLoader({ logo, slogan }: { logo: { src: string; width: number; height: number }; slogan: string }) {
  const root = useRef<HTMLDivElement>(null);

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
    const q = gsap.utils.selector(el);
    const rtl = html.dir === "rtl";

    // Shown progress follows real progress smoothly; everything visual reads from it.
    const shown = { p: 0 };
    const digits = q(`.${styles.digits}`) as HTMLElement[];
    const lines = q(`.${styles.line}`) as HTMLElement[];
    const mask = q(`.${styles.reveal}`)[0] as HTMLElement | undefined;
    const render = () => {
      const p = shown.p;
      const n = Math.round(p * 100);
      // Odometer: each column is a strip of 0–9 moved by whole digits (hundreds column: 0–1).
      [Math.floor(n / 100), Math.floor(n / 10) % 10, n % 10].forEach((d, i) => {
        if (digits[i]) digits[i].style.transform = `translateY(${-d * 10}%)`;
      });
      // Three layers fill with a small lag between them, like walls coming off the die.
      lines.forEach((l, i) => {
        l.style.transform = `scaleX(${gsap.utils.clamp(0, 1, p * 1.12 - i * 0.06)})`;
      });
      if (mask) {
        const hidden = (1 - p) * 100;
        mask.style.clipPath = rtl ? `inset(0 0 0 ${hidden}%)` : `inset(0 ${hidden}% 0 0)`;
      }
    };
    render();

    // Entrance: the frame settles in while the first assets load.
    const intro = gsap.timeline();
    intro
      .from(q(`.${styles.glow}`), { autoAlpha: 0, scale: 0.8, duration: 1.4, ease: ease.settle }, 0)
      .from(q(`.${styles.logoWrap}`), { y: 18, autoAlpha: 0, duration: 0.9, ease: ease.settle }, 0.1)
      .from(q(`.${styles.meta}`), { y: 10, autoAlpha: 0, duration: 0.7, ease: ease.out }, 0.3)
      .from(q(`.${styles.word}`), { yPercent: 110, duration: 0.8, stagger: 0.07, ease: ease.out }, 0.35);

    // Real loading state: webfonts + every hero image marked critical.
    const imgs = Array.from(document.querySelectorAll<HTMLImageElement>("img[data-critical]"));
    const tasks: Promise<unknown>[] = [document.fonts ? document.fonts.ready : Promise.resolve(), ...imgs.map(waitForImage)];
    let done = 0;
    const total = tasks.length;
    const toProgress = (p: number, duration = 0.55) => gsap.to(shown, { p, duration, ease: ease.ui, overwrite: true, onUpdate: render });
    // A gentle head start so the counter is never frozen at 000 while the first asset arrives.
    toProgress(0.12, 0.9);
    tasks.forEach((t) =>
      t.then(() => {
        done += 1;
        if (!cancelled) toProgress(0.12 + (done / total) * 0.88);
      }),
    );

    const ready = Promise.race([Promise.all(tasks), new Promise((r) => window.setTimeout(r, MAX_WAIT_MS))]);

    let tl: gsap.core.Timeline | undefined;
    ready.then(() => {
      if (cancelled) return;
      // Let the entrance finish before leaving, so a fast load still shows the whole moment.
      tl = gsap.timeline({
        delay: Math.max(0, intro.duration() - intro.time()),
        onComplete: () => {
          el.style.display = "none";
          release();
        },
      });
      tl.to(shown, { p: 1, duration: 0.45, ease: ease.ui, onUpdate: render })
        .to(q(`.${styles.stage}`), { y: -36, autoAlpha: 0, duration: 0.55, ease: ease.inOut }, "+=0.25")
        .addLabel("lift", "-=0.25")
        .set(el, { backgroundColor: "transparent" }, "lift")
        // The three layers run off in reading direction one after another, like walls leaving the die.
        .to(q(`.${styles.layer}`), { xPercent: rtl ? -101 : 101, duration: 0.95, stagger: 0.1, ease: ease.inOut }, "lift")
        .to(q(`.${styles.glow}`), { autoAlpha: 0, duration: 0.4 }, "lift")
        .call(
          () => {
            release();
            startIntro();
            try {
              sessionStorage.setItem(INTRO_SEEN_KEY, "1");
            } catch {}
          },
          undefined,
          "lift+=0.2",
        );
    });

    return () => {
      cancelled = true;
      intro.kill();
      tl?.kill();
      window.clearTimeout(safety);
      release();
    };
  }, []);

  const words = slogan.split(/\s+/).filter(Boolean);

  return (
    <div ref={root} className={styles.loader} aria-hidden="true">
      {Array.from({ length: LAYERS }, (_, i) => (
        <div key={i} className={styles.layer} />
      ))}
      <div className={styles.glow} />
      <div className={styles.stage}>
        <div className={styles.logoWrap}>
          {/* The logo, dim, with a bright copy revealed in reading direction as assets load. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.ghost} src={logo.src} alt="" width={logo.width} height={logo.height} data-no-mirror />
          <div className={styles.reveal}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo.src} alt="" width={logo.width} height={logo.height} data-no-mirror />
          </div>
        </div>
        <p className={styles.slogan}>
          {words.map((w, i) => (
            <span key={i} className={styles.wordMask}>
              <span className={styles.word}>{w}</span>
            </span>
          ))}
        </p>
        <div className={styles.meta} dir="ltr">
          <div className={styles.lines}>
            {Array.from({ length: LAYERS }, (_, i) => (
              <span key={i} className={styles.track} data-layer={i}>
                <span className={styles.line} />
              </span>
            ))}
          </div>
          <span className={styles.counter}>
            {[2, 10, 10].map((count, i) => (
              <span key={i} className={styles.col}>
                <span className={styles.digits}>
                  {Array.from({ length: 10 }, (_, d) => (
                    <span key={d}>{d < count ? d : ""}</span>
                  ))}
                </span>
              </span>
            ))}
            <span className={styles.pct}>%</span>
          </span>
        </div>
      </div>
    </div>
  );
}
