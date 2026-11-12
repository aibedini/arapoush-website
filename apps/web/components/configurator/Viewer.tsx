"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { SceneLabels, SceneSpec, TubeScene } from "./TubeScene";
import styles from "./Configurator.module.css";

type Props = {
  cfg: SceneSpec;
  label: string;
  labels: SceneLabels;
  caption: string;
  fileName: string;
  t: {
    loading: string;
    noWebgl: string;
    hint: string;
    autoRotate: string;
    zoomIn: string;
    zoomOut: string;
    focusCap: string;
    focusBody: string;
    dimensions: string;
    inspect: string;
    reset: string;
    fullscreen: string;
    snapshot: string;
  };
};

/**
 * 3D stage. Three.js (≈150 KB gz) is only fetched when the stage nears the viewport;
 * rendering is on demand and pauses offscreen.
 */
export default function Viewer({ cfg, label, labels, caption, fileName, t }: Props) {
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<SVGSVGElement>(null);
  const scene = useRef<TubeScene | null>(null);
  const latest = useRef({ cfg, labels });
  latest.current = { cfg, labels };
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "failed">("idle");
  const [auto, setAuto] = useState(false);
  const [dims, setDims] = useState(true);
  const [inspect, setInspect] = useState(false);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    const el = stage.current!;
    let s: TubeScene | null = null;
    let cancelled = false;
    let idle = 0;
    const start = async () => {
      setStatus("loading");
      try {
        const { TubeScene } = await import("./TubeScene");
        if (cancelled) return;
        const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
        s = new TubeScene({
          canvas: canvas.current!,
          overlay: overlay.current!,
          reducedMotion: reduced,
          labels: latest.current.labels,
          font: getComputedStyle(document.body).fontFamily,
          onInteract: () => setTouched(true),
        });
        s.setConfig(latest.current.cfg);
        s.setAutoRotate(!reduced);
        setAuto(!reduced);
        scene.current = s;
        setStatus("ready");
      } catch {
        setStatus("failed");
      }
    };
    // WebGL setup is the heaviest work on the page, so it waits for intent: the stage is on screen
    // AND the visitor has scrolled, touched or typed — then it runs in an idle slot.
    let seen = false;
    let engaged = false;
    const intents = ["pointerdown", "keydown", "wheel", "touchstart", "scroll"] as const;
    const maybeStart = () => {
      if (!seen || !engaged || idle) return;
      // Safari < 18 has no requestIdleCallback.
      idle = typeof requestIdleCallback === "function" ? requestIdleCallback(() => void start(), { timeout: 1200 }) : Number(setTimeout(() => void start(), 200));
    };
    const onIntent = () => {
      engaged = true;
      intents.forEach((t) => removeEventListener(t, onIntent));
      maybeStart();
    };
    intents.forEach((t) => addEventListener(t, onIntent, { passive: true, once: true }));
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e?.isIntersecting) return;
        io.disconnect();
        seen = true;
        maybeStart();
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => {
      cancelled = true;
      io.disconnect();
      intents.forEach((t) => removeEventListener(t, onIntent));
      if (typeof cancelIdleCallback === "function") cancelIdleCallback(idle);
      clearTimeout(idle);
      s?.dispose();
      scene.current = null;
    };
  }, []);

  useEffect(() => {
    scene.current?.setLabels(labels);
    scene.current?.setConfig(cfg);
  }, [cfg, labels]);

  // In fullscreen the page can't scroll, so a vertical swipe tilts the tube instead (all the way round).
  useEffect(() => {
    const onFs = () => {
      if (canvas.current) canvas.current.style.touchAction = document.fullscreenElement === stage.current ? "none" : "pan-y";
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const s = () => scene.current;
  const toggle = (value: boolean, set: (v: boolean) => void, apply: (v: boolean) => void) => {
    set(!value);
    apply(!value);
  };

  const ready = status === "ready";
  return (
    <div className={styles.viewer}>
      <div
        ref={stage}
        className={styles.stage}
        role="application"
        aria-roledescription="3D viewer"
        aria-label={label}
        tabIndex={0}
        onKeyDown={(e) => {
          const v = s();
          if (!v) return;
          const keys: Record<string, () => void> = {
            ArrowLeft: () => v.rotate(-0.2),
            ArrowRight: () => v.rotate(0.2),
            ArrowUp: () => v.tilt(0.2),
            ArrowDown: () => v.tilt(-0.2),
            "+": () => v.zoom(0.85),
            "=": () => v.zoom(0.85),
            "-": () => v.zoom(1.18),
            Home: () => v.reset(),
          };
          const run = keys[e.key];
          if (!run) return;
          e.preventDefault();
          setTouched(true);
          run();
        }}
      >
        <canvas ref={canvas} className={styles.canvas} hidden={status === "failed"} />
        <svg ref={overlay} className={styles.overlay} aria-hidden="true" direction="ltr" />
        {(status === "idle" || status === "loading") && (
          <p className={styles.stageNote} role="status">
            <span className={styles.spinner} aria-hidden="true" />
            {t.loading}
          </p>
        )}
        {status === "failed" && <p className={styles.stageNote}>{t.noWebgl}</p>}
        {ready && !touched && (
          <p className={styles.hint} aria-hidden="true">
            {t.hint}
          </p>
        )}
      </div>

      <div className={styles.toolbar} role="toolbar" aria-label={label.split(".")[0]}>
        <Tool label={t.autoRotate} pressed={auto} disabled={!ready} onClick={() => toggle(auto, setAuto, (v) => s()?.setAutoRotate(v))}>
          <path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v4h-4" />
        </Tool>
        <Tool label={t.zoomIn} disabled={!ready} onClick={() => s()?.zoom(0.85)}>
          <circle cx="11" cy="11" r="6.5" />
          <path d="M16 16l4 4M8.5 11h5M11 8.5v5" />
        </Tool>
        <Tool label={t.zoomOut} disabled={!ready} onClick={() => s()?.zoom(1.18)}>
          <circle cx="11" cy="11" r="6.5" />
          <path d="M16 16l4 4M8.5 11h5" />
        </Tool>
        <Tool label={t.focusCap} disabled={!ready} onClick={() => s()?.focus("cap")}>
          <path d="M7 4h10v5H7zM8.5 9v3M15.5 9v3M6 12h12v8H6z" />
        </Tool>
        <Tool label={t.focusBody} disabled={!ready} onClick={() => s()?.focus("body")}>
          <path d="M8 3h8l1 4v14H7V7l1-4ZM7 7h10M10 12h4M10 15h4" />
        </Tool>
        <Tool label={t.dimensions} pressed={dims} disabled={!ready} onClick={() => toggle(dims, setDims, (v) => s()?.setDimensions(v))}>
          <path d="M4 7v10M20 7v10M4 12h16M7 9.5 4.5 12 7 14.5M17 9.5l2.5 2.5-2.5 2.5" />
        </Tool>
        <Tool label={t.inspect} pressed={inspect} disabled={!ready} onClick={() => toggle(inspect, setInspect, (v) => s()?.setExplode(v))}>
          <path d="M12 3 3 7.5l9 4.5 9-4.5L12 3ZM3 12l9 4.5 9-4.5M3 16.5 12 21l9-4.5" />
        </Tool>
        <Tool label={t.reset} disabled={!ready} onClick={() => s()?.reset()}>
          <path d="M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4" />
          <circle cx="12" cy="12" r="1.5" />
        </Tool>
        <Tool
          label={t.snapshot}
          disabled={!ready}
          onClick={() => {
            const url = s()?.snapshot(caption);
            if (!url) return;
            const a = document.createElement("a");
            a.href = url;
            a.download = fileName;
            a.click();
          }}
        >
          <path d="M4 8h3l1.5-2h7L17 8h3v11H4V8Z" />
          <circle cx="12" cy="13" r="3.5" />
        </Tool>
        <Tool
          label={t.fullscreen}
          disabled={!ready}
          onClick={() => {
            if (document.fullscreenElement) void document.exitFullscreen();
            else void stage.current?.requestFullscreen?.();
          }}
        >
          <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />
        </Tool>
      </div>
    </div>
  );
}

function Tool({
  label,
  pressed,
  disabled,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" className={styles.tool} aria-label={label} title={label} aria-pressed={pressed} disabled={disabled} onClick={onClick}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {children}
      </svg>
    </button>
  );
}
