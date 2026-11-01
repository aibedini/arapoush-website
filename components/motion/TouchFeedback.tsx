"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const TapRipple = dynamic(() => import("./TapRipple"), { ssr: false });

/** Touch-only extras, loaded once the page is idle so they never compete with first paint. */
export default function TouchFeedback() {
  const [on, setOn] = useState(false);

  useEffect(() => {
    if (!window.matchMedia("(hover: none) and (pointer: coarse)").matches) return;
    // iOS Safari only applies :active styles when a touch listener exists.
    const noop = () => {};
    document.addEventListener("touchstart", noop, { passive: true });
    const id = window.requestIdleCallback ? window.requestIdleCallback(() => setOn(true), { timeout: 3000 }) : window.setTimeout(() => setOn(true), 1500);
    return () => {
      document.removeEventListener("touchstart", noop);
      if (window.cancelIdleCallback) window.cancelIdleCallback(id);
      else window.clearTimeout(id);
    };
  }, []);

  return on ? <TapRipple /> : null;
}
