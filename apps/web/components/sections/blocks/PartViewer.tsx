"use client";

import { useEffect, useRef, useState } from "react";
import type { Mounted, PartScene } from "./partScene";
import styles from "./Block.module.css";

/**
 * The 3D view of a product3d block. Three.js loads only when the block nears the screen and the
 * browser is idle; until then (and without WebGL) the visitor sees the poster or a quiet frame.
 */
export default function PartViewer({ body, closure, label, hint }: { body: Mounted | null; closure: Mounted | null; label: string; hint: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<"idle" | "ready" | "failed">("idle");
  const key = JSON.stringify([body, closure]);

  useEffect(() => {
    let scene: PartScene | null = null;
    let cancelled = false;
    const start = async () => {
      try {
        const { PartScene } = await import("./partScene");
        if (cancelled || !canvas.current) return;
        scene = new PartScene(canvas.current);
        await scene.load(body, closure);
        if (!cancelled) setState("ready");
      } catch {
        if (!cancelled) setState("failed");
      }
    };
    const io = new IntersectionObserver(
      (es) => {
        if (!es.some((e) => e.isIntersecting)) return;
        io.disconnect();
        const idle = window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 200));
        idle(() => void start());
      },
      { rootMargin: "300px" },
    );
    if (wrap.current) io.observe(wrap.current);
    return () => {
      cancelled = true;
      io.disconnect();
      scene?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key stands for body and closure by value
  }, [key]);

  return (
    <div ref={wrap} className={styles.viewer} data-state={state} role="img" aria-label={label}>
      <canvas ref={canvas} hidden={state === "failed"} />
      {state === "ready" && (
        <p className={styles.viewerHint} aria-hidden="true">
          {hint}
        </p>
      )}
    </div>
  );
}
