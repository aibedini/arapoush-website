"use client";

import { useEffect } from "react";
type Motion = typeof import("@/lib/animations/motion");

/**
 * Subtle depth for card imagery, wired once for the whole page so the cards themselves stay
 * server-rendered. Markup: `data-drift-host="10"` on the card, `data-drift` on the moving layer.
 * Fine pointers: the layer follows the cursor by up to N px. Touch: it drifts with scroll.
 */
export default function Drift() {
  useEffect(() => {
    // GSAP is fetched while the browser is idle, after the page has painted: it is not part of the
    // page's startup JavaScript (LCP and TBT), and everything wired here sits below the first screen.
    let dead = false;
    let cleanup: void | (() => void);
    const start = () =>
      void import("@/lib/animations/motion").then((m) => {
        if (!dead) cleanup = setup(m);
      });
    const handle = window.requestIdleCallback ? window.requestIdleCallback(start, { timeout: 2500 }) : window.setTimeout(start, 300);
    return () => {
      dead = true;
      if (window.cancelIdleCallback) window.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
      if (cleanup) cleanup();
    };
  }, []);

  return null;
}

function setup({ gsap, registerGsap, prefersReducedMotion }: Motion): void | (() => void) {
  if (prefersReducedMotion()) return;
  registerGsap();
  const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const cleanups: Array<() => void> = [];

  document.querySelectorAll<HTMLElement>("[data-drift-host]").forEach((host) => {
    const target = host.querySelector<HTMLElement>("[data-drift]");
    if (!target) return;
    const strength = Number(host.dataset.driftHost) || 10;

    if (!fine) {
      const tween = gsap.fromTo(
        target,
        { y: -strength * 1.2 },
        { y: strength * 1.2, ease: "none", scrollTrigger: { trigger: host, start: "top bottom", end: "bottom top", scrub: 0.6 } },
      );
      cleanups.push(() => tween.scrollTrigger?.kill() ?? tween.kill());
      return;
    }

    const x = gsap.quickTo(target, "x", { duration: 0.8, ease: "power3.out" });
    const y = gsap.quickTo(target, "y", { duration: 0.8, ease: "power3.out" });
    const move = (e: PointerEvent) => {
      const r = host.getBoundingClientRect();
      x(((e.clientX - r.left) / r.width - 0.5) * strength * 2);
      y(((e.clientY - r.top) / r.height - 0.5) * strength * 2);
    };
    const leave = () => {
      x(0);
      y(0);
    };
    host.addEventListener("pointermove", move);
    host.addEventListener("pointerleave", leave);
    cleanups.push(() => {
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerleave", leave);
      gsap.killTweensOf(target);
    });
  });

  return () => cleanups.forEach((fn) => fn());
}
