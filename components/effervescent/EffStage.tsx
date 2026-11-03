"use client";

import { useEffect, useRef, useState } from "react";
import Image, { getImageProps } from "next/image";
import RollText from "@/components/ui/RollText";
import type { Dictionary } from "@/lib/i18n";
import type { EffProduct, EffSizeDef } from "@/lib/products";
import type { EffScene } from "./EffScene";
import styles from "./Effervescent.module.css";

type Props = {
  t: Dictionary["productEff"];
  product: EffProduct;
  size: EffSizeDef;
  dir: "rtl" | "ltr";
  locale: string;
};

const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));

/** True when WebGL is missing or drawn on the CPU (SwiftShader, llvmpipe, basic render driver). */
function softwareGL() {
  const c = document.createElement("canvas");
  const gl = (c.getContext("webgl2") ?? c.getContext("webgl")) as WebGLRenderingContext | null;
  if (!gl) return true;
  const ext = gl.getExtension("WEBGL_debug_renderer_info");
  const name = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
  gl.getExtension("WEBGL_lose_context")?.loseContext();
  return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);
}

/**
 * Hero and opening story share one sticky stage: the copy scrolls over a single 3D tube whose pose is
 * scrubbed by scroll (so it reverses on the way up). Until WebGL is ready, and wherever it fails, a
 * render of the same tube stands in.
 */
export default function EffStage({ t, product, size, dir, locale }: Props) {
  const root = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const sticky = useRef<HTMLDivElement>(null);
  const scene = useRef<EffScene | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "failed">("idle");
  const [touched, setTouched] = useState(false);
  const [poured, setPoured] = useState(false);
  const [canDrop, setCanDrop] = useState(false);
  const side = dir === "rtl" ? -1 : 1;
  const nf = new Intl.NumberFormat(locale);
  const nn = new Intl.NumberFormat(locale, { minimumIntegerDigits: 2 });
  const poster = product.images.poster;
  const studio = product.images.studio;
  const tag = dir === "rtl" ? "rtl" : "ltr";

  useEffect(() => {
    const el = root.current!;
    let s: EffScene | null = null;
    let cancelled = false;
    let idle = 0;
    let kill: (() => void) | null = null;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

    const start = async () => {
      // Without a GPU (software WebGL), a live studio would stall the page: keep the rendered poster.
      if (softwareGL() && !new URLSearchParams(location.search).has("webgl")) {
        setStatus("failed");
        return;
      }
      setStatus("loading");
      try {
        const [{ EffScene }, { ScrollTrigger, registerGsap }] = await Promise.all([import("./EffScene"), import("@/lib/animations/motion")]);
        if (cancelled) return;
        s = new EffScene({
          canvas: canvas.current!,
          reducedMotion: reduced,
          side,
          logo: "/images/logo.png",
          onInteract: () => setTouched(true),
          onPoured: setPoured,
          onGlass: setCanDrop,
          // Per frame, so straight to a CSS variable rather than through React state.
          onMood: (m) => sticky.current?.style.setProperty("--mood", m.toFixed(3)),
        });
        s.setSize(size.d, size.h);
        await s.warm();
        if (cancelled) return;
        scene.current = s;
        if (process.env.NODE_ENV !== "production") (window as unknown as { __effScene?: EffScene }).__effScene = s;
        registerGsap();
        // Reduced motion: the tube stays in its hero pose; the story is plain reading.
        if (!reduced) {
          const st = ScrollTrigger.create({
            trigger: el,
            start: "top top",
            end: "bottom bottom",
            onUpdate: (self) => {
              const p = self.progress;
              s?.setProgress(p);
            },
          });
          kill = () => st.kill();
          s.setProgress(st.progress, true);
        }
        setStatus("ready");
      } catch {
        setStatus("failed");
      }
    };

    // WebGL is the heaviest work on the page: it starts at the first idle moment after load (or
    // sooner, on intent), so the tablet drops by itself for visitors who just watch.
    const intents = ["pointerdown", "keydown", "wheel", "touchstart", "scroll"] as const;
    let begun = false;
    let later = 0;
    const onIntent = () => {
      if (begun) return;
      begun = true;
      intents.forEach((e) => removeEventListener(e, onIntent));
      clearTimeout(later);
      idle = typeof requestIdleCallback === "function" ? requestIdleCallback(() => void start(), { timeout: 1200 }) : Number(setTimeout(() => void start(), 200));
    };
    intents.forEach((e) => addEventListener(e, onIntent, { passive: true, once: true }));
    const onLoad = () => void (later = Number(setTimeout(onIntent, 300)));
    if (document.readyState === "complete") onLoad();
    else addEventListener("load", onLoad, { once: true });
    return () => {
      cancelled = true;
      clearTimeout(later);
      removeEventListener("load", onLoad);
      intents.forEach((e) => removeEventListener(e, onIntent));
      if (typeof cancelIdleCallback === "function") cancelIdleCallback(idle);
      clearTimeout(idle);
      kill?.();
      s?.dispose();
      scene.current = null;
    };
  }, [side, size.d, size.h]);

  // Art-directed poster: a wide and a tall render of the same tube, already on the right side.
  const wide = getImageProps({ src: `${poster.src.replace(".webp", "")}-wide-${tag}.webp`, alt: "", width: 1600, height: 1000, sizes: "100vw", priority: true });
  const tall = getImageProps({ src: `${poster.src.replace(".webp", "")}-tall-${tag}.webp`, alt: "", width: 780, height: 1688, sizes: "100vw", priority: true });

  return (
    <section ref={root} className={styles.stage} aria-labelledby="eff-title">
      <div ref={sticky} className={styles.sticky}>
        {/* Studio backdrop behind the live 3D: warm light on the glass side (mirrored for left-to-right). */}
        <div className={styles.backdrop} aria-hidden="true">
          {studio && <Image src={studio.src} alt="" fill priority sizes="100vw" quality={80} className={styles.backdropImg} data-no-mirror />}
        </div>
        <div className={styles.moodVeil} aria-hidden="true" />
        <div ref={layer} className={styles.layer} data-ready={status === "ready" || undefined}>
          <picture className={styles.poster} aria-hidden="true">
            <source media="(max-aspect-ratio: 19/20)" srcSet={tall.props.srcSet} sizes="100vw" />
            <img {...wide.props} alt="" data-no-mirror fetchPriority="high" />
          </picture>
          <canvas
            ref={canvas}
            className={styles.canvas}
            role="img"
            aria-label={fill(t.viewerLabel, { d: nf.format(size.d), h: nf.format(size.h) })}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") scene.current?.rotate(-0.25 * side);
              else if (e.key === "ArrowRight") scene.current?.rotate(0.25 * side);
              else if ((e.key === "Enter" || e.key === " ") && poured) scene.current?.scatter();
              else if ((e.key === "Enter" || e.key === " ") && canDrop) scene.current?.drop();
              else return;
              e.preventDefault();
            }}
          />
          {status === "loading" && <span className={styles.loader} aria-hidden="true" />}
        </div>
        {/* Poured tablets react to taps; this button is the same action for keyboards and screen readers. */}
        <button type="button" className={styles.scatter} data-show={poured || undefined} tabIndex={poured ? 0 : -1} aria-hidden={!poured} onClick={() => scene.current?.scatter()}>
          <span className={styles.tapDot} aria-hidden="true" />
          {t.scatter}
        </button>
        <button type="button" className={styles.scatter} data-show={canDrop || undefined} tabIndex={canDrop ? 0 : -1} aria-hidden={!canDrop} onClick={() => scene.current?.drop()}>
          <span className={styles.tapDot} aria-hidden="true" />
          {t.drop}
        </button>
      </div>

      <div className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className="eyebrow">{t.eyebrow}</p>
          <h1 id="eff-title" className={styles.heroTitle}>
            {t.title.map((line, i) => (
              <span key={line} className={i ? styles.accent : undefined}>
                {line}
              </span>
            ))}
          </h1>
          <p className={styles.heroLead}>{t.lead}</p>
          <div className={styles.heroCtas}>
            <a href="#contact" className="btn">
              <RollText text={t.quote} />
            </a>
            <a href="#sizes" className="btn btn--ghost">
              <RollText text={t.sizesLink} />
            </a>
          </div>
        </div>
        <p className={styles.dragHint} data-hidden={touched || poured || canDrop || status !== "ready" || undefined} aria-hidden="true">
          <span className={styles.dragIcon} />
          {t.drag}
        </p>
      </div>

      <ol className={styles.steps}>
        {t.story.map((step, i) => (
          <li key={step.title} className={styles.step}>
            <div className={styles.stepCopy}>
              <span className={`${styles.stepNum} ltr`} aria-hidden="true">
                {nn.format(i + 1)}
                <small>/ {nn.format(t.story.length)}</small>
              </span>
              <h2 className={styles.stepTitle}>{step.title}</h2>
              <p className={styles.stepText}>{step.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
